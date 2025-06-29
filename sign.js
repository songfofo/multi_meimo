const axios = require('axios');

// 增强配置 - 模拟真实浏览器
const baseConfig = {
  baseURL: 'https://www.modubox.ai',
  timeout: 30000, // 增加超时时间
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
    'DNT': '1',
    'Sec-GPC': '1'
  }
};

// 创建axios实例
const client = axios.create(baseConfig);

// 添加请求拦截器模拟更真实的行为
client.interceptors.request.use(config => {
  // 添加随机延迟
  const delay = Math.floor(Math.random() * 2000) + 1000; // 1-3秒
  return new Promise(resolve => {
    setTimeout(() => resolve(config), delay);
  });
});

// 生成随机设备ID
function generateDeviceId() {
  return Date.now().toString() + Math.floor(Math.random() * 1000000);
}

// 解析账户
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

// 首先访问主页，获取cookies和建立会话
async function initSession() {
  try {
    console.log('正在初始化会话...');
    await client.get('/');
    console.log('会话初始化成功');
    return true;
  } catch (error) {
    console.error('会话初始化失败:', error.message);
    return false;
  }
}

// 增强的登录函数
async function login(username, password) {
  try {
    console.log(`开始登录账户: ${username}...`);
    
    // 初始化会话
    const sessionInit = await initSession();
    if (!sessionInit) {
      throw new Error('会话初始化失败');
    }
    
    const deviceId = generateDeviceId();
    
    // 添加更多真实的请求头
    const loginHeaders = {
      ...baseConfig.headers,
      'Content-Type': 'application/json',
      'Origin': baseConfig.baseURL,
      'Referer': `${baseConfig.baseURL}/login`,
      'X-Requested-With': 'XMLHttpRequest'
    };
    
    const loginResponse = await client({
      method: 'post',
      url: '/api/user/login',
      headers: loginHeaders,
      data: {
        username: username,
        password: password,
        code: password,
        inviteCode: '',
        deviceId: deviceId
      }
    });
    
    if (loginResponse.data && loginResponse.data.data && loginResponse.data.data.token) {
      console.log(`账户 ${username} 登录成功，获得token`);
      return loginResponse.data.data.token;
    } else {
      console.error(`账户 ${username} 登录失败，响应:`, loginResponse.data);
      throw new Error(`账户 ${username} 登录失败，未获得token`);
    }
  } catch (error) {
    console.error(`账户 ${username} 登录错误:`, error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
      
      // 如果是403错误，特别提示
      if (error.response.status === 403) {
        console.error('⚠️ 检测到Cloudflare防护，请考虑使用其他方案');
      }
    }
    throw error;
  }
}

// 增强的签到函数
async function signIn(username, token) {
  try {
    console.log(`开始为账户 ${username} 执行签到...`);
    
    const signHeaders = {
      ...baseConfig.headers,
      'Content-Type': 'application/json',
      'Authorization': token,
      'Origin': baseConfig.baseURL,
      'Referer': `${baseConfig.baseURL}/dashboard`
    };
    
    const signResponse = await client({
      method: 'post',
      url: '/api/user/sign-in',
      headers: signHeaders,
      data: {}
    });
    
    console.log(`账户 ${username} 签到成功！响应数据:`, signResponse.data);
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
    // 1. 登录获取token
    const token = await login(account.username, account.password);
    
    // 2. 使用token签到
    const signResult = await signIn(account.username, token);
    
    console.log(`✅ 账户 ${account.username} 自动签到完成`);
    return true;
  } catch (error) {
    console.error(`❌ 账户 ${account.username} 自动签到失败:`, error.message);
    return false;
  }
}

// 主函数
async function main() {
  try {
    console.log('🚀 开始执行自动签到脚本...');
    
    // 获取账户列表
    const accounts = getAccounts();
    console.log(`📋 找到 ${accounts.length} 个账户需要处理`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      
      // 账户间增加更长的随机延迟
      if (i > 0) {
        const delay = 5000 + Math.floor(Math.random() * 10000); // 5-15秒
        console.log(`⏳ 等待 ${delay}ms 后处理下一个账户...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const success = await processAccount(account);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    console.log(`\n📊 所有账户处理完成`);
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失败: ${failCount}`);
    
    if (failCount > 0) {
      console.log('\n💡 如果遇到403错误，建议：');
      console.log('1. 使用代理IP池');
      console.log('2. 改用云服务器定时任务');
      console.log('3. 手动执行签到');
    }
    
  } catch (error) {
    console.error('❌ 脚本执行失败:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main();