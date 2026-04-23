require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// 使用 puppeteer-extra 和 stealth 插件
puppeteer.use(StealthPlugin());

const baseConfig = {
  baseURL: 'https://www.sexyai.ai',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
};
const browserCloseTimeoutMs = Number(process.env.BROWSER_CLOSE_TIMEOUT_MS || 10000);
// 'https://www.meimo3.com'
function generateDeviceId() {
  return Date.now().toString() + Math.random().toString().slice(2);
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

async function withTimeout(promise, ms, message) {
  return Promise.race([promise, timeoutAfter(ms, message)]);
}

async function clickTabbarItemByText(page, targetText, fallbackSelector) {
  const clicked = await page.evaluate((text) => {
    const tabItems = Array.from(document.querySelectorAll('.u-tabbar-item'));
    const targetItem = tabItems.find((item) => {
      const label = (item.innerText || item.textContent || '').replace(/\s+/g, '');
      const rect = item.getBoundingClientRect();
      return label.includes(text) && rect.width > 0 && rect.height > 0;
    });

    if (!targetItem) return false;
    targetItem.click();
    return true;
  }, targetText);

  if (clicked) return 'text';

  await page.waitForSelector(fallbackSelector, { visible: true, timeout: 15000 });
  await page.click(fallbackSelector);
  return 'fallback';
}

async function processAccount(account) {
  let browser = null;
  console.log(`🚀 开始处理账户: ${account.username}...`);
  try {
    console.log('启动浏览器并应用 stealth 插件...');
    browser = await puppeteer.launch({
      headless: true, // 调试时建议设为 false，确认脚本稳定运行后可改为 true
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
      console.error(`❌ 账户 ${account.username} 登录失败. 响应中缺少 token:`, JSON.stringify(loginResult));
      throw new Error(`登录失败，未能获取 token。`);
    }

    console.log(`✅ 账户 ${account.username} 登录成功, 已获取凭证。`);

    const token = loginResult.data.token;
    const userInfo = loginResult.data;
    const TOKEN_KEY = 'TOKEN_KEY_';
    const USER_INFO_KEY = 'USER_INFO_KEY_';

    console.log(`正在将凭证注入浏览器...`);
    await page.evaluate((tokKey, tokVal, userKey, userVal) => {
      localStorage.setItem(tokKey, tokVal);
      const userInfoString = JSON.stringify({ type: 'object', data: userVal });
      localStorage.setItem(userKey, userInfoString);
    }, TOKEN_KEY, token, USER_INFO_KEY, userInfo);

    console.log('凭证注入完成，正在重新加载页面以应用会话...');
    await page.goto(baseConfig.baseURL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('登录后的页面已加载。');
    
    console.log('等待5秒，让首页充分渲染...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // ==============================================================================
    // --- 关键修改：使用循环和组合选择器处理多个公告弹窗 ---
    // ==============================================================================
    console.log('▶️ 开始循环检查并关闭所有公告弹窗 (查找 .notice-btn2 或 .notice-btn1)...');
    let closedCount = 0;
    const maxNoticesToClose = 5; // 设置一个上限，防止无限循环

    for (let i = 0; i < maxNoticesToClose; i++) {
        try {
            // 定义组合选择器，可以匹配 .notice-btn2 或 .notice-btn1
            const closeButtonSelector = '.notice-btn2, .notice-btn1';
            
            // 等待任意一个按钮出现，设置一个较短的超时时间
            await page.waitForSelector(closeButtonSelector, { visible: true, timeout: 5000 });
            
            // 点击找到的第一个匹配按钮
            await page.click(closeButtonSelector);
            closedCount++;
            console.log(`  -> ✅ 已关闭第 ${closedCount} 个公告弹窗。`);
            
            // 等待一小段时间，让下一个弹窗（如果有的话）加载出来
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (error) {
            // 如果在超时时间内没有找到按钮，说明没有（或没有更多）弹窗了
            console.log('✅ 未再发现公告弹窗，流程继续...');
            break; // 退出循环
        }
    }
    if (closedCount === maxNoticesToClose) {
        console.log('⚠️ 已达到最大弹窗关闭次数，可能还有弹窗未关闭。');
    }
    // ==============================================================================

    // 定义所有步骤的正确选择器。第一步优先按文字锁定，选择器仅作为兜底。
    const step1_NavigateButtonSelector = '.u-tabbar__content__item-wrapper .u-tabbar-item:nth-child(3)';
    const step2_TaskButtonSelector = '.get-rewards-btn';
    const step3_PopupButtonSelector = '.gen-link-btn';

    try {
      console.log('开始执行每日签到流程...');
      
      console.log('  -> 1/3: 正在查找并点击底部"领电量"导航按钮...');
      const navigateClickMethod = await clickTabbarItemByText(page, '领电量', step1_NavigateButtonSelector);
      if (navigateClickMethod === 'text') {
        console.log('  -> 已通过按钮文字锁定"领电量"导航按钮。');
      } else {
        console.log('  -> 未能通过文字锁定，已使用原选择器兜底点击。');
      }
      console.log('  -> "领电量"导航按钮已点击。');

      console.log('  -> 2/3: 正在查找任务页面的"领取奖励"按钮...');
      await page.waitForSelector(step2_TaskButtonSelector, { visible: true, timeout: 15000 });
      await page.click(step2_TaskButtonSelector);
      console.log('  -> "领取奖励"按钮已点击。');
      
      console.log('  -> 3/3: 正在查找并点击最终确认弹窗的"领取"按钮...');
      await page.waitForSelector(step3_PopupButtonSelector, { visible: true, timeout: 15000 });

      console.log('  -> 弹窗按钮已找到，等待 500ms 确保动画播放完毕...');
      await new Promise(resolve => setTimeout(resolve, 500)); 
      
      console.log('  -> 准备点击最终按钮并监听API响应...');
      const finalResponsePromise = page.waitForResponse(response =>
        response.url().includes('/api/user/sign-in') && response.status() === 200, { timeout: 30000 }
      );
      
      await page.click(step3_PopupButtonSelector);
      console.log('  -> 最终"领取"按钮已点击。');

      const finalResponse = await finalResponsePromise; 

      const responseJson = await finalResponse.json();
      if (responseJson.data === true) { 
        console.log(`✅✅✅ 账户 ${account.username} 已成功完成每日签到！`);
      } else {
        console.log(`ℹ️  账户 ${account.username} 签到操作完成，但服务器返回: "${responseJson.message}" (可能今日已签到)`);
      }
    } catch (error) {
      console.error(`❌ 账户 ${account.username} 在模拟点击过程中失败。`);
      const errorScreenshotPath = `error_screenshot_${account.username}_${Date.now()}.png`;
      await page.screenshot({ path: errorScreenshotPath, fullPage: true });
      console.log(`📷 已保存错误截图至: ${errorScreenshotPath}`);

      if (error.name === 'TimeoutError') {
        console.error('错误原因：超时。某个按钮未在规定时间内出现。请再次检查选择器或网站结构是否已改变。');
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
      try {
        await withTimeout(browser.close(), browserCloseTimeoutMs, `关闭浏览器超过 ${browserCloseTimeoutMs / 1000} 秒`);
        console.log('浏览器已关闭。');
      } catch (error) {
        console.error(`⚠️ 浏览器关闭超时或失败: ${error.message}`);
        const browserProcess = browser.process && browser.process();
        if (browserProcess) {
          browserProcess.kill('SIGKILL');
          console.error('⚠️ 已强制结束浏览器进程。');
        }
      }
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
    process.exit(0);
  } catch (error) {
    console.error('❌ 脚本主程序执行失败:', error.message);
    process.exit(1);
  }
}

main();
