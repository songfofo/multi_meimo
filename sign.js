const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// 使用 puppeteer-extra 和 stealth 插件
puppeteer.use(StealthPlugin());

// ***重要更新***：根据您的最新证据，将 baseURL 改回 sexyai.top
const baseConfig = {
  baseURL: 'https://www.sexyai.top',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
};

function generateDeviceId() {
  return Date.now().toString() + Math.random().toString().slice(2);
}

async function processAccount(account) {
  let browser = null;
  console.log(`🚀 开始处理账户: ${account.username}...`);
  try {
    console.log('启动无头浏览器并应用 stealth 插件...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'],
    });
    const page = await browser.newPage();
    await page.setUserAgent(baseConfig.userAgent);

    console.log(`导航至 ${baseConfig.baseURL} 以处理 Cloudflare...`);
    await page.goto(baseConfig.baseURL, { waitUntil: 'networkidle2', timeout: 90000 });
    console.log('Cloudflare 验证通过，页面加载完成。');

    console.log(`尝试为账户 ${account.username} 登录...`);
    const loginResult = await page.evaluate(async (url, username, password, deviceId) => {
      try {
        const response = await fetch(`${url}/api/user/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Lang': 'ZH' },
          body: JSON.stringify({ username, password, code: "", inviteCode: '', deviceId })
        });
        return await response.json();
      } catch (e) {
        return { error: e.message };
      }
    }, baseConfig.baseURL, account.username, account.password, generateDeviceId());

    if (loginResult.error || !loginResult.data || !loginResult.data.token) {
      console.error(`❌ 账户 ${account.username} 登录失败. 响应:`, JSON.stringify(loginResult));
      throw new Error(`登录失败，未能获取 token。`);
    }

    const token = loginResult.data.token;
    console.log(`✅ 账户 ${account.username} 登录成功。`);

    console.log(`尝试为账户 ${account.username} 执行签到...`);
    const signInResult = await page.evaluate(async (url, authToken) => {
      try {
        const response = await fetch(`${url}/api/user/sign-in`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': `Bearer ${authToken}`, 'Lang': 'ZH' },
          body: JSON.stringify({})
        });
        return await response.json();
      } catch (e) {
        return { error: e.message };
      }
    }, baseConfig.baseURL, token);

    // 精确地检查 'data' 字段是否为 true
    if (signInResult.data === true) {
      console.log(`✅✅✅ 账户 ${account.username} 签到成功！`);
    } else {
      console.log(`ℹ️  账户 ${account.username} 今日可能已签到或签到失败。服务器消息:`, signInResult.message || JSON.stringify(signInResult));
    }
    
    return true;

  } catch (error) {
    console.error(`❌ 处理账户 ${account.username} 时发生错误:`, error.message);
    return false;
  } finally {
    if (browser) {
      await browser.close();
      console.log('浏览器已关闭。');
    }
  }
}

// --- 后续代码无需修改 ---

function getAccounts() {
  try {
    const accountsString = process.env.ACCOUNTS;
    if (!accountsString) throw new Error('未配置账户信息，请在 GitHub Secrets 中设置 ACCOUNTS。');
    const accounts = JSON.parse(accountsString);
    if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('账户格式无效或为空。');
    return accounts;
  } catch (error) {
    console.error('解析账户信息时出错:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 自动签到脚本启动...');
    const accounts = getAccounts();
    console.log(`📋 发现 ${accounts.length} 个账户需要处理。`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const [index, account] of accounts.entries()) {
      const success = await processAccount(account);
      if (success) successCount++;
      else failCount++;

      if (index < accounts.length - 1) {
        const delay = 5000 + Math.floor(Math.random() * 10000);
        console.log(`⏳ 随机等待 ${delay / 1000} 秒后处理下一个账户...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log(`\n📊 所有账户处理完毕。`);
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失败: ${failCount}`);
    
    if (failCount > 0) process.exit(1);
  } catch (error) {
    console.error('❌ 脚本主程序执行失败:', error.message);
    process.exit(1);
  }
}

main();