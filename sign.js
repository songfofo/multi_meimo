const axios = require('axios');

// 增强配置 - 模拟真实浏览器
const baseConfig = {
  // 修正1: 更新为新的 baseURL
  baseURL: 'https://sexyai.top',
  timeout: 30000,
  headers: {
    // 修正2: 更新 User-Agent 以匹配你成功请求的浏览器（可选，但建议）
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    // 'Upgrade-Insecure-Requests': '1', // 对于API请求，这个头通常不是必需的
    'Sec-Fetch-Dest': 'empty', // API请求通常是 'empty'
    'Sec-Fetch-Mode': 'cors',    // API请求通常是 'cors'
    'Sec-Fetch-Site': 'same-origin', // 从网站内部发起的API请求
    'DNT': '1',
    'Sec-GPC': '1'
  }
};

// 创建axios实例
const client = axios.create(baseConfig);

// ... (其他函数保持不变) ...

// 生成随机设备ID
function generateDeviceId() {
  // 修正3: 你的截图中的deviceId非常长，我们模拟一个类似的格式
  return Date.now().toString() + Math.random().toString().slice(2);
}

// ... (getAccounts 和 initSession 函数保持不变) ...

// 增强的登录函数
async function login(username, password) {
  try {
    console.log(`开始登录账户: ${username}...`);
    
    // 初始化会话 (这一步很可能会因为Cloudflare失败)
    const sessionInit = await initSession();
    if (!sessionInit) {
      throw new Error('会话初始化失败');
    }
    
    const deviceId = generateDeviceId();
    
    const loginHeaders = {
      ...baseConfig.headers,
      'Content-Type': 'application/json',
      'Origin': baseConfig.baseURL,
      'Referer': `${baseConfig.baseURL}/` // 修正4: Referer通常是主页或登录页
    };
    
    const loginResponse = await client({
      method: 'post',
      url: '/api/user/login',
      headers: loginHeaders,
      data: {
        username: username,
        // 修正5: 'code' 字段应为空字符串
        code: "", 
        password: password,
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
      
      if (error.response.status === 403) {
        console.error('⚠️ 检测到Cloudflare防护，标准HTTP请求可能无法通过。');
      }
    }
    throw error;
  }
}

// ... (signIn, processAccount, main 函数保持不变) ...

// 增强的签到函数
async function signIn(username, token) {
  try {
    console.log(`开始为账户 ${username} 执行签到...`);
    
    const signHeaders = {
      ...baseConfig.headers,
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`, // 通常Token前会有一个 'Bearer ' 前缀，如果不需要可以去掉
      'Origin': baseConfig.baseURL,
      'Referer': `${baseConfig.baseURL}/` // 签到操作的Referer可能是 dashboard 或其他页面
    };
    
    const signResponse = await client({
      method: 'post',
      url: '/api/user/sign-in',
      headers: signHeaders,
      data: {} // 签到通常没有载荷
    });
    
    if(signResponse.data.code === 200) {
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
      console.log('\n💡 由于Cloudflare防护，脚本在GitHub Actions上很可能持续失败。');
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

async function initSession() {
  try {
    console.log('正在初始化会话...');
    // 这一步在有Cloudflare的环境下会失败
    await client.get('/');
    console.log('会话初始化成功');
    return true;
  } catch (error) {
    console.error('会话初始化失败:', error.message);
    return false;
  }
}

async function processAccount(account) {
  try {
    const token = await login(account.username, account.password);
    if (token) {
        await signIn(account.username, token);
        console.log(`✅ 账户 ${account.username} 自动签到流程完成`);
        return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ 账户 ${account.username} 自动签到失败:`, error.message);
    return false;
  }
}

main();