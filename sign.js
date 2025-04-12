const axios = require('axios');

// Base configuration
const baseConfig = {
  baseURL: 'https://www.meimoai4.com',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
};

// Generate random device ID
function generateDeviceId() {
  return Date.now().toString() + Math.floor(Math.random() * 1000000);
}

// Parse accounts from environment variable
function getAccounts() {
  try {
    // Format should be: [{"username":"user1","password":"pass1"},{"username":"user2","password":"pass2"}]
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

// Login function
async function login(username, password) {
  try {
    console.log(`Starting login process for account: ${username}...`);
    const deviceId = generateDeviceId();
    
    const loginResponse = await axios({
      method: 'post',
      url: `${baseConfig.baseURL}/api/user/login`,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': baseConfig.userAgent
      },
      data: {
        username: username,
        password: password,
        code: password, // According to your login request, code is same as password
        inviteCode: '',
        deviceId: deviceId
      }
    });
    
    if (loginResponse.data && loginResponse.data.data && loginResponse.data.data.token) {
      console.log(`Login successful for account: ${username}, token obtained`);
      return loginResponse.data.data.token;
    } else {
      console.error(`Login failed for account: ${username}, response:`, loginResponse.data);
      throw new Error(`Login failed for account: ${username}, no token received`);
    }
  } catch (error) {
    console.error(`Login error for account ${username}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Sign-in function
async function signIn(username, token) {
  try {
    console.log(`Starting sign-in process for account: ${username}...`);
    const signResponse = await axios({
      method: 'post',
      url: `${baseConfig.baseURL}/api/user/sign-in`,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': baseConfig.userAgent,
        'Authorization': token
      },
      data: {} // Empty object based on Content-Length: 2
    });
    
    console.log(`Sign-in successful for account: ${username}! Response data:`, signResponse.data);
    return signResponse.data;
  } catch (error) {
    console.error(`Sign-in error for account ${username}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Process a single account
async function processAccount(account) {
  try {
    // 1. Login to get token
    const token = await login(account.username, account.password);
    
    // 2. Use token to sign in
    const signResult = await signIn(account.username, token);
    
    console.log(`Auto sign-in completed for account: ${account.username}`);
    return true;
  } catch (error) {
    console.error(`Auto sign-in failed for account ${account.username}:`, error.message);
    return false;
  }
}

// Main function
async function main() {
  try {
    // Get accounts from environment variable
    const accounts = getAccounts();
    console.log(`Found ${accounts.length} accounts to process`);
    
    // Process each account with a delay between them
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      
      // Add random delay between accounts to seem more human-like
      if (i > 0) {
        const delay = 3000 + Math.floor(Math.random() * 5000); // 3-8 seconds
        console.log(`Waiting ${delay}ms before processing next account...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const success = await processAccount(account);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    console.log(`All accounts processed. Success: ${successCount}, Failed: ${failCount}`);
  } catch (error) {
    console.error('Script execution failed:', error.message);
    process.exit(1);
  }
}

// Execute main function
main();