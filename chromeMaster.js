const path = require('path');
const { exec } = require('child_process');
const ps = require('ps-node');
const net = require('net'); // 用于检查端口
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const AdmZip = require('adm-zip');
const ChromeController = require('./chromeController');
const dotenv = require('dotenv');

class ChromeManager {
    constructor() {
        this.CHROME_PATH = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"';
        // 从环境变量获取 BASE_DIR，如果未设置则使用默认值
        this.BASE_DIR = process.env.CHROME_USER_DATA_DIR || path.join(process.cwd(), 'USERDATA');
        
        // 窗口基础设置
        this.WINDOW_WIDTH = 525;
        this.WINDOW_HEIGHT = 741;
        this.MARGIN_X = 10;
        this.START_X = 10;
        this.START_Y = 10;
        
        this.positions = this.calculatePositions();
        this.activeProcesses = new Map();

        this.PLUGINS_DIR = path.join(process.cwd(), 'plugins');
        this.EXTRACTED_DIR = path.join(process.cwd(), 'extracted_plugins');
        this.PROXY_FILE = path.join(process.cwd(), 'proxy.txt');

        this.chromeController = new ChromeController();
    }

    async readProxyList() {
        try {
            const content = await fs.readFile(this.PROXY_FILE, 'utf-8');
            return content.split('\n')
                .map(line => line.trim())
                .filter(line => line && line.includes(':'));
        } catch (error) {
            console.error('读取代理文件失败:', error);
            return [];
        }
    }

    calculatePositions() {
        const positions = [];
        const ROWS = 2;
        const COLS = 5;
        
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const x = this.START_X + col * (this.WINDOW_WIDTH + this.MARGIN_X);
                const y = this.START_Y + row * this.WINDOW_HEIGHT + (row * 20);
                positions.push([x, y]);
            }
        }
        return positions;
    }

    getPosition(number) {
        const lastDigit = number % 10;
        if (lastDigit === 0) {
            return 9;
        }
        return lastDigit - 1;
    }

    getUserDataDir(number) {
        return path.join(this.BASE_DIR, number.toString().padStart(4, '0'));
    }

    async closeChrome(number) {
        const userDataDir = this.activeProcesses.get(number);
        if (!userDataDir) return;
    
        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const wmic = spawn('wmic', ['process', 'where', 'name="chrome.exe"', 'get', 'commandline,processid', '/format:csv']);
            
            let output = '';
            wmic.stdout.on('data', (data) => {
                output += data.toString();
            });
    
            wmic.on('close', () => {
                const lines = output.split('\n');
                const chromeProcesses = lines
                    .filter(line => line.includes(userDataDir))
                    .map(line => {
                        const parts = line.split(',');
                        return parts[parts.length - 1].trim();
                    })
                    .filter(pid => pid && /^\d+$/.test(pid));
    
                if (chromeProcesses.length > 0) {
                    console.log(`关闭 Chrome ${number} 的进程: ${chromeProcesses.join(', ')}`);
                    chromeProcesses.forEach(pid => {
                        try {
                            // 添加进程存在检查
                            if (process.kill(parseInt(pid), 0)) {  // 检查进程是否存在
                                process.kill(parseInt(pid));
                            }
                        } catch (err) {
                            // 忽略 ESRCH 错误（进程不存在）
                            if (err.code !== 'ESRCH') {
                                console.error(`关闭进程 ${pid} 失败:`, err);
                            }
                        }
                    });
                } else {
                    console.log(`未找到 Chrome ${number} 的进程`);
                }
    
                this.activeProcesses.delete(number);
                resolve();
            });
        });
    }
    

    // 新增：检查端口是否可用的方法
    async checkPort(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.listen(port, () => {
                server.once('close', () => {
                    resolve(true);
                });
                server.close();
            });
            server.on('error', () => {
                resolve(false);
            });
        });
    }

    // 新增：获取随机可用端口的方法
    async getRandomPort() {
        const MIN_PORT = 10000;
        const MAX_PORT = 65535;
        
        while (true) {
            const port = Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1) + MIN_PORT);
            const isAvailable = await this.checkPort(port);
            if (isAvailable) {
                return port;
            }
        }
    }

    async extractCrxFiles() {
        if (!fsSync.existsSync(this.EXTRACTED_DIR)) {
            await fs.mkdir(this.EXTRACTED_DIR, { recursive: true });
        }

        try {
            const files = await fs.readdir(this.PLUGINS_DIR);
            const crxFiles = files.filter(file => file.endsWith('.crx'));

            for (const crxFile of crxFiles) {
                const crxPath = path.join(this.PLUGINS_DIR, crxFile);
                const extractPath = path.join(this.EXTRACTED_DIR, path.parse(crxFile).name);

                if (fsSync.existsSync(extractPath)) {
                    continue;
                }

                try {
                    // 读取文件内容
                    const buffer = await fs.readFile(crxPath);
                    
                    // 跳过 CRX 头部（通常是 16 字节或更多）
                    const zipStartOffset = buffer.indexOf('PK');
                    if (zipStartOffset === -1) {
                        throw new Error('Invalid CRX format');
                    }
                    
                    // 创建新的 Buffer，只包含 ZIP 内容
                    const zipBuffer = Buffer.from(buffer.slice(zipStartOffset));
                    
                    // 使用 adm-zip 解压
                    const zip = new AdmZip(zipBuffer);
                    zip.extractAllTo(extractPath, true);
                    
                    console.log(`成功解压: ${crxPath}`);
                } catch (err) {
                    console.error(`解压失败: ${crxPath}, 错误: ${err}`);
                    continue;
                }
            }

            return true;
        } catch (error) {
            console.error('解压插件失败:', error);
            return false;
        }
    }

    // 新增：获取所有解压后的插件路径
    async getExtensionPaths() {
        try {
            const dirs = await fs.readdir(this.EXTRACTED_DIR);
            return dirs.map(dir => path.join(this.EXTRACTED_DIR, dir));
        } catch (error) {
            console.error('获取插件路径失败:', error);
            return [];
        }
    }

    async openChrome(number) {
        const position = this.getPosition(number);
        const [x, y] = this.positions[position];
        const userDataDir = this.getUserDataDir(number);
        
        // 获取随机可用端口
        const debugPort = await this.getRandomPort();

        // 读取代理列表
        const proxyList = await this.readProxyList();
        const proxyArg = proxyList[number - 1] 
            ? `--proxy-server=${proxyList[number - 1]}` 
            : '';

        if (proxyArg) {
            console.log(`Chrome ${number} 使用代理: ${proxyList[number - 1]}`);
        }

        // 确保插件已解压
        await this.extractCrxFiles();
        
        // 获取所有插件路径
        const extensionPaths = await this.getExtensionPaths();
        const extensionsArg = extensionPaths.length > 0 
            ? `--load-extension=${extensionPaths.join(',')}` 
            : '';

        // 添加所有启动参数
        const chromeArgs = [
            `--window-size=${this.WINDOW_WIDTH},${this.WINDOW_HEIGHT}`,
            `--window-position=${x},${y}`,
            `--user-data-dir="${userDataDir}"`,
            '--no-message-box',
            '--no-first-run',
            '--no-default-browser-check',
            '--no-restore-session-state',
            '--disable-session-crashed-bubble',
            '--hide-crash-restore-bubble',
            '--disable-features=Translate',
            '--metrics-recording-only',
            '--mute-audio',
            `--remote-debugging-port=${debugPort}`,
            proxyArg,
            extensionsArg
        ].join(' ');
        
        const chromeCommand  = `${this.CHROME_PATH} ${chromeArgs}`;
        
        console.log(`打开 Chrome ${number} (${userDataDir}) 在位置 [${x}, ${y}], 调试端口: ${debugPort}`);
        if (extensionPaths.length > 0) {
            console.log(`加载插件: ${extensionPaths.length} 个`);
        }
        // 启动 Chrome
        exec(chromeCommand);
        this.activeProcesses.set(number, userDataDir);
        
        // 等待Chrome启动完成
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            // 调用控制Chrome的方法
            await this.chromeController.control(debugPort, number, command);

            // 等待几秒后关闭Chrome
            return new Promise((resolve) => {
                setTimeout(async () => {
                    await this.closeChrome(number);
                    setTimeout(resolve, 1000);
                }, 5000);
            });
        } catch (error) {
            await this.closeChrome(number);
            throw error;
        }
    }
    

    async startSequenceWithLimit(start, end, concurrentLimit = 10, command = 'test') {
        const proxyList = await this.readProxyList();
        if (proxyList.length < end) {
            console.warn(`警告: 代理列表数量(${proxyList.length})小于结束范围(${end}), 部分实例将不使用代理`);
        }
        
        if (!fsSync.existsSync(this.BASE_DIR)) {
            await fs.mkdir(this.BASE_DIR, { recursive: true });
        }
    
        console.log(`开始并发运行序列 ${start} 到 ${end}，并发数：${concurrentLimit}`);
        
        const numbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        const results = [];
        
        // 分批处理
        for (let i = 0; i < numbers.length; i += concurrentLimit) {
            const batch = numbers.slice(i, i + concurrentLimit);
            const batchPromises = batch.map((num, index) => {
                return new Promise(resolve => {
                    const delay = index * 5000; // 每个实例间隔5秒
                    setTimeout(() => {
                        console.log(`启动 Chrome ${num}`);
                        resolve(this.openChrome(num, command));
                    }, delay);
                });
            });
            
            try {
                await Promise.all(batchPromises);
                console.log(`完成批次 ${i / concurrentLimit + 1}`);
            } catch (error) {
                console.error(`批次 ${i / concurrentLimit + 1} 执行出错:`, error);
            }
        }
    }
    
}

// 使用示例
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const command = process.argv[2];
if (!command) {
    console.error('请指定要执行的命令！例如: node chromeMaster.js metamaskLogin');
    process.exit(1);
}

const manager = new ChromeManager();
const controller = manager.chromeController;

// 验证命令是否存在
if (!controller.commands.has(command)) {
    console.error('无效的命令！可用命令：', Array.from(controller.commands.keys()).join(', '));
    process.exit(1);
}

readline.question('请输入起始范围（例如：1）：', start => {
    readline.question('请输入结束范围（例如：100）：', end => {
        readline.question('请输入并发数（例如：5）：', concurrent => {
            // 传入命令参数
            manager.startSequenceWithLimit(parseInt(start), parseInt(end), parseInt(concurrent), command)
                .then(() => {
                    console.log('程序执行完成');
                    readline.close();
                })
                .catch(error => {
                    console.error('程序执行出错:', error);
                    readline.close();
                });
        });
    });
});
