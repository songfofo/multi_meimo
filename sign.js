const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// 使用 puppeteer-extra 和 stealth 插件
puppeteer.use(StealthPlugin());

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

    console.log('导航至主页...');
    await page.goto(baseConfig.baseURL, { waitUntil: 'networkidle2', timeout: 90000 });
    console.log('页面加载完成。');

    // 登录操作
    console.log(`尝试为账户 ${account.username} 登录...`);
    const loginResult = await page.evaluate(async (url, username, password, deviceId) => {
      try {
        const response = await fetch(`${url}/api/user/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, code: "", inviteCode: '', deviceId })
        });
        return await response.json();
      } catch (e) {
        return { error: e.message };
      }
    }, baseConfig.baseURL, account.username, account.password, generateDeviceId());

    if (!loginResult.data || !loginResult.data.token) {
      console.error(`❌ 账户 ${account.username} 登录失败. 响应:`, JSON.stringify(loginResult));
      throw new Error(`登录失败，未能获取 token。`);
    }
    console.log(`✅ 账户 ${account.username} 登录成功。`);
    
    // 登录后刷新页面，确保登录状态在浏览器中生效
    console.log('登录后刷新页面以应用会话...');
    await page.goto(baseConfig.baseURL, { waitUntil: 'networkidle2', timeout: 60000 });

    // ==============================================================================
    // --- 最终确认的三个步骤对应的选择器 ---
    // ==============================================================================
    // 第1步: 点击底部导航栏第3个按钮，用于跳转到任务/奖励页面
    const step1_NavigateButtonSelector = '.uni-tabbar .uni-tabbar__item:nth-child(4)'; 
    
    // 第2步: 在任务页面上，点击“每日签到”的“领取”任务按钮
    const step2_TaskButtonSelector = '.rewards-item uni-button';
    
    // 第3步: 在弹出的窗口中，点击最终的“我知道了”确认按钮
    const step3_PopupButtonSelector = '.dialog-btn-confirm';
    // ==============================================================================

    try {
      // --- 第1步：点击底部导航按钮，跳转页面 ---
      console.log('1/3: 正在查找底部导航栏按钮...');
      await page.waitForSelector(step1_NavigateButtonSelector, { visible: true, timeout: 15000 });
      console.log('导航按钮已找到，正在点击以跳转到奖励页面...');
      await page.click(step1_NavigateButtonSelector);

      // --- 第2步：在奖励页面点击任务按钮 ---
      console.log('2/3: 正在查找奖励页面的任务按钮...');
      // 等待新按钮出现，这表明页面已成功跳转
      await page.waitForSelector(step2_TaskButtonSelector, { visible: true, timeout: 15000 });
      console.log('任务按钮已找到，正在点击...');
      await page.click(step2_TaskButtonSelector);
      
      // --- 第3步：点击弹窗中的最终确认按钮 ---
      console.log('3/3: 正在查找弹窗中的最终确认按钮...');
      await page.waitForSelector(step3_PopupButtonSelector, { visible: true, timeout: 15000 });
      console.log('最终确认按钮已找到，准备点击并验证API响应...');

      // 点击最后一个按钮时，我们监听API响应来确认签到是否真的成功
      const [finalResponse] = await Promise.all([
        page.waitForResponse(response => 
          response.url().includes('/api/user/sign-in') && response.status() === 200,
          { timeout: 30000 }
        ),
        page.click(step3_PopupButtonSelector)
      ]);

      const responseJson = await finalResponse.json();
      if (responseJson.data === true) {
        console.log(`✅✅✅ 账户 ${account.username} 已成功完成所有点击步骤并签到成功！`);
      } else {
        console.log(`ℹ️  账户 ${account.username} 操作完成，但服务器返回失败消息: "${responseJson.message}" (可能今日已签到)`);
      }

    } catch (error) {
      console.error(`❌ 账户 ${account.username} 在模拟点击过程中失败。`);
      if (error.name === 'TimeoutError') {
        console.error('错误原因：超时。某个按钮未在规定时间内出现。请检查您的选择器或网站结构是否已改变。');
      } else {
        console.error('未知错误详情:', error.message);
      }
      return false;
    }
    
    return true;

  } catch (error) {
    console.error(`❌ 处理账户 ${account.username} 时发生严重错误:`, error.message);
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
