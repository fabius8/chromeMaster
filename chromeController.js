// chromeController.js
const puppeteer = require('puppeteer');
const axios = require('axios');
require('dotenv').config();
const fs = require('fs').promises;

const config = {
  password: process.env.PASSWORD || '12345678', // 从.env读取密码
  privateKeyFile: 'private.txt'  // 私钥文件路径
};

async function readPrivateKeys() {
    try {
      const content = await fs.readFile('private.txt', 'utf8');
      return content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0); // 过滤空行
    } catch (error) {
      console.error('读取私钥文件失败:', error);
      throw error;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class ChromeController {
    constructor() {
        this.commands = new Map();
        this.initCommands();
    }

    initCommands() {
        // 注册所有命令
        this.commands.set('metamaskLogin', this.metamaskLogin.bind(this));
        this.commands.set('test', this.test.bind(this));
        this.commands.set('okxLogin', this.okxLogin.bind(this));
        this.commands.set('okxImport', this.okxImport.bind(this));
    }

    async control(debugPort, number, command) {
        try {
            const webSocketDebuggerUrl = `http://127.0.0.1:${debugPort}/json/version`;
            let wsKey = await axios.get(webSocketDebuggerUrl);
            
            const browser = await puppeteer.connect({
                browserWSEndpoint: wsKey.data.webSocketDebuggerUrl,
                defaultViewport: null
            });

            // 执行指定的命令
            if (this.commands.has(command)) {
                await this.commands.get(command)(browser, number);
            } else {
                throw new Error(`未知命令: ${command}`);
            }
    
            await browser.disconnect();
        } catch (error) {
            console.error(`Chrome ${number} 操作失败:`, error);
            throw error;
        }
    }


    
    // 各种命令的具体实现
    async metamaskLogin(browser, number) {
        const page = await browser.newPage();
        try {
            console.log(`正在处理 MetaMask 登录 ${number}`);
            await page.goto('chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/home.html');
            // 添加 MetaMask 登录相关操作...
            await page.waitForTimeout(2000);
        } finally {
            await page.close();
        }
    }

    async test(browser, number) {
        const page = await browser.newPage();
        try {
            console.log(`正在执行测试 ${number}`);
            await page.goto('https://www.baidu.com');
            console.log(`Chrome ${number} 已成功访问百度`);
        } finally {
            await page.close();
        }
    }

    async okxImport(browser, number) {
        const page = await browser.newPage();
        try {
            console.log(`Chrome ${number} 正在导入 OKX 钱包私钥`);
        
            // 读取私钥
            const privateKeys = await readPrivateKeys();
            const privateKey = privateKeys[number - 1];
            if (!privateKey) {
                throw new Error(`Chrome ${number} 没有对应的私钥`);
            }
    
            // 1. 访问钱包页面
            await page.goto('chrome-extension://mcohilncbfahbmgdjkbpemcciiolgcge/popup.html');
            await sleep(2000);
    
            // 2. 点击"导入已有钱包"
            await page.waitForSelector('button[data-testid="okd-button"] span.btn-content');
            const buttons = await page.$$('button[data-testid="okd-button"] span.btn-content');
            for (const button of buttons) {
                const text = await page.evaluate(el => el.textContent, button);
                if (text.includes('导入已有钱包')) {
                    await button.click();
                    break;
                }
            }
            await sleep(2000);
    
            // 3. 点击"助记词或私钥"
            await page.waitForSelector('div[class*="_typography-text"]');
            const divs = await page.$$('div[class*="_typography-text"]');
            for (const div of divs) {
                const text = await page.evaluate(el => el.textContent, div);
                if (text.includes('助记词或私钥')) {
                    await div.click();
                    break;
                }
            }
            await sleep(2000);
    
            // 4. 点击"私钥"选项
            await page.waitForSelector('div.okui-tabs-pane');
            const tabPanes = await page.$$('div.okui-tabs-pane');
            for (const pane of tabPanes) {
                const text = await page.evaluate(el => el.textContent, pane);
                if (text.includes('私钥')) {
                    await pane.click();
                    break;
                }
            }
            await sleep(2000);
    
            // 5. 输入私钥
            await page.waitForSelector('textarea[data-testid="okd-input"]');
            await page.type('textarea[data-testid="okd-input"]', privateKey);
            await sleep(2000);
    
            // 6. 点击第一个确认按钮
            await page.waitForSelector('button[data-testid="okd-button"][type="submit"]');
            await page.click('button[data-testid="okd-button"][type="submit"]');
            await sleep(2000);
    
            // 7. 点击第二个确认按钮
            await page.waitForSelector('button.chains-choose-network-modal__confirm-button');
            await page.click('button.chains-choose-network-modal__confirm-button');
            await sleep(2000);
    
            // 8. 点击下一步
            const nextButtons = await page.$$('button[data-testid="okd-button"] span.btn-content');
            for (const button of nextButtons) {
                const text = await page.evaluate(el => el.textContent, button);
                if (text.includes('下一步')) {
                    await button.click();
                    break;
                }
            }
            await sleep(2000);
    
            // 9. 输入密码两次
            const passwordInputs = await page.$$('input[data-testid="okd-input"][type="password"]');
            await passwordInputs[0].type(config.password);
            await passwordInputs[1].type(config.password);
            await sleep(2000);
    
            // 10. 点击最后的确认按钮
            await page.click('button[data-testid="okd-button"][type="submit"]');
            
            await sleep(2000);
            console.log(`Chrome ${number} OKX 钱包私钥导入成功`);
    

        } catch (error) {
            console.error(`Chrome ${number} OKX 钱包私钥导入失败:`, error);
            throw error;
        } finally {
            await page.close();
        }
    }

    async okxLogin(browser, number) {
        const page = await browser.newPage();
        try {
            console.log(`正在处理 OKX 钱包登录 ${number}`);
            // OKX 钱包插件的 Chrome extension ID
            await page.goto('chrome-extension://mcohilncbfahbmgdjkbpemcciiolgcge/popup.html');
            
            // 等待页面加载
            await page.waitForTimeout(2000);

            // 检查是否需要输入密码（首次使用）
            const passwordInput = await page.$('input[type="password"]');
            if (passwordInput) {
                console.log(`Chrome ${number} OKX 钱包首次登录，设置密码`);
                await passwordInput.type('your_password_here'); // 替换为实际密码
                
                // 点击确认按钮
                const confirmButton = await page.$('button[type="submit"]');
                if (confirmButton) {
                    await confirmButton.click();
                }
            }

            // 等待登录完成
            await page.waitForTimeout(2000);
            console.log(`Chrome ${number} OKX 钱包登录成功`);

        } catch (error) {
            console.error(`Chrome ${number} OKX 钱包登录失败:`, error);
            throw error;
        } finally {
            await page.close();
        }
    }
}

module.exports = ChromeController;
