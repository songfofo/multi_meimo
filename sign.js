const axios = require('axios');
const puppeteer = require('puppeteer');

// 增强配置 - 模拟真实浏览器，匹配您提供的headers
const baseConfig = {
  baseURL: 'https://sexyai.top',
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Connection': 'keep-alive',
    'Sec-Ch-Ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Priority': 'u=1, i',
    'Lang': 'ZH'
  }
};

// 创建axios实例
const client = axios.create(baseConfig);

// 生成随机设备ID，匹配您提供的格式（时间戳 + 随机数）
function generateDeviceId() {
  return Date.now().toString() + Math.random().toString().slice(2);
}

// 新函数：使用Puppeteer获取Cloudflare cookies
async function getCloudflareCookies() {
  try {
    console.log('Launching headless browser to bypass Cloudflare...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      // 移除 executablePath，让Puppeteer使用内置Chromium
    });
    const page = await browser.newPage();
    
    // 设置User-Agent以匹配
    await page.setUserAgent(baseConfig.headers['User-Agent']);
    
    // 导航到站点（这会触发并解决Cloudflare挑战）
    await page.goto(baseConfig.baseURL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // 额外等待以确保cookies设置
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const cookies = await page.cookies();
    await browser.close();
    
    // 格式化为字符串用于headers
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log('Cloudflare cookies obtained:', cookieString);
    
    return cookieString;
  } catch (error) {
    console.error('Failed to get Cloudflare cookies:', error.message);
    throw error;
  }
}

// 增强的登录函数
async function login(username, password) {
  try {
    console.log(`开始登录账户: ${username}...`);
    
    // 获取Cloudflare cookies
    const cookieString = await getCloudflareCookies();
    
    const deviceId = generateDeviceId();
    
    const loginHeaders = {
      ...baseConfig.headers,
      'Content-Type': 'application/json',
      'Origin': baseConfig.baseURL,
      'Referer': `${baseConfig.baseURL}/`,
      'Cookie': cookieString  // 注入cookies
    };
    
    const loginResponse = await client({
      method: 'post',
      url: '/api/user/login',
      headers: loginHeaders,
      data: {
        username: username,
        code: "", 
        password: password,
        inviteCode: '',
        deviceId: deviceId
      }
    });
    
    if (loginResponse.data && loginResponse.data.data && loginResponse.data.data.token) {
      console.log(`账户 ${username} 登录成功，获得token`);
      return { token: loginResponse.data.data.token, cookieString };  // 返回token和cookies以供signIn使用
    } else {
      console.error(`账户 ${username} 登录失败，响应:`, loginResponse.data);
      throw new Error(`账户 ${username} 登录失败，未获得token`);
    }
  } catch (error) {
    console.error(`账户 ${username} 登录错误:`, error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
      
      if (error.response.status === 403) {
        console.error('⚠️ 检测到Cloudflare防护，标准HTTP请求可能无法通过。');
      }
    }
    throw error;
  }
}

// 增强的签到函数
async function signIn(username, token, cookieString) {
  try {
    console.log(`开始为账户 ${username} 执行签到...`);
    
    const signHeaders = {
      ...baseConfig.headers,
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': baseConfig.baseURL,
      'Referer': `${baseConfig.baseURL}/`,
      'Cookie': cookieString  // 使用相同的cookies
    };
    
    const signResponse = await client({
      method: 'post',
      url: '/api/user/sign-in',
      headers: signHeaders,
      data: {} // 签到通常没有载荷
    });
    
    if (signResponse.data.code === 200) {
      console.log(`账户 ${username} 签到成功！响应数据:`, signResponse.data.message);
    } else {
      console.log(`账户 ${username} 签到失败或已签到。响应数据:`, signResponse.data.message);
    }
    return signResponse.data;
  } catch (error) {
    console.error(`账户 ${username} 签到错误:`, error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    throw error;
  }
}

// 处理单个账户
async function processAccount(account) {
  try {
    const { token, cookieString } = await login(account.username, account.password);
    if (token) {
      await signIn(account.username, token, cookieString);
      console.log(`✅ 账户 ${account.username} 自动签到流程完成`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ 账户 ${account.username} 自动签到失败:`, error.message);
    return false;
  }
}

// 获取账户
function getAccounts() {
  try {
    const accountsString = process.env.ACCOUNTS;
    if (!accountsString) {
      throw new Error('No accounts configured. Set the ACCOUNTS secret in GitHub.');
    }
    const accounts = JSON.parse(accountsString);
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('Invalid accounts format or empty accounts array.');
    }
    return accounts;
  } catch (error) {
    console.error('Error parsing accounts:', error.message);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    console.log('🚀 开始执行自动签到脚本...');
    
    const accounts = getAccounts();
    console.log(`📋 找到 ${accounts.length} 个账户需要处理`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const account of accounts) {
      const success = await processAccount(account);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      // 随机延迟
      if (accounts.indexOf(account) < accounts.length - 1) {
        const delay = 5000 + Math.floor(Math.random() * 10000); // 5-15秒
        console.log(`⏳ 等待 ${delay/1000}s 后处理下一个账户...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log(`\n📊 所有账户处理完成`);
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失败: ${failCount}`);
    
    if (failCount > 0) {
      console.log('\n💡 由于Cloudflare防护，脚本在GitHub Actions上可能仍需优化。');
    }
    
  } catch (error) {
    console.error('❌ 脚本执行失败:', error.message);
    process.exit(1);
  }
}

// 模拟 process.env.ACCOUNTS 用于本地测试
if (process.env.NODE_ENV !== 'production') {
  process.env.ACCOUNTS = JSON.stringify([
    { "username": "2214601986lxx@gmail.com", "password": "your_password" },
    { "username": "2214601986@qq.com", "password": "your_password" }
  ]);
}

main();