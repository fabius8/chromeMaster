// chromeController.js
const puppeteer = require('puppeteer');
const axios = require('axios');

class ChromeController {
    constructor() {
        this.commands = new Map();
        this.initCommands();
    }

    initCommands() {
        // 注册所有命令
        this.commands.set('metamaskLogin', this.metamaskLogin.bind(this));
        this.commands.set('test', this.test.bind(this));
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
}

module.exports = ChromeController;
