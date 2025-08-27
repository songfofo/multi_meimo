const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Use puppeteer-extra with the stealth plugin to be less detectable
puppeteer.use(StealthPlugin());

// Enhanced configuration
const baseConfig = {
  baseURL: 'https://sexyai.top',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
};

// Generate a random device ID
function generateDeviceId() {
  return Date.now().toString() + Math.random().toString().slice(2);
}

// Function to perform login and sign-in within the browser context
async function processAccount(account) {
  let browser = null;
  console.log(`🚀 Starting process for account: ${account.username}...`);
  try {
    console.log('Launching headless browser with stealth...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Recommended for CI environments
        '--single-process'
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent(baseConfig.userAgent);

    // Go to the homepage to resolve Cloudflare and get initial cookies
    console.log(`Navigating to ${baseConfig.baseURL} to bypass Cloudflare...`);
    await page.goto(baseConfig.baseURL, { waitUntil: 'networkidle2', timeout: 90000 });
    console.log('Cloudflare bypass successful. Page loaded.');

    // --- Perform Login via page.evaluate (replaces axios) ---
    console.log(`Attempting to log in for ${account.username}...`);
    const loginResult = await page.evaluate(async (url, username, password, deviceId) => {
      try {
        const response = await fetch(`${url}/api/user/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Lang': 'ZH'
          },
          body: JSON.stringify({
            username: username,
            password: password,
            code: "",
            inviteCode: '',
            deviceId: deviceId
          })
        });
        return await response.json();
      } catch (e) {
        return { error: e.message };
      }
    }, baseConfig.baseURL, account.username, account.password, generateDeviceId());

    if (loginResult.error || !loginResult.data || !loginResult.data.token) {
      console.error(`❌ Account ${account.username} login failed. Response:`, JSON.stringify(loginResult));
      throw new Error(`Login failed, no token obtained.`);
    }

    const token = loginResult.data.token;
    console.log(`✅ Account ${account.username} logged in successfully.`);

    // --- Perform Sign-in via page.evaluate (replaces axios) ---
    console.log(`Attempting to sign in for ${account.username}...`);
    const signInResult = await page.evaluate(async (url, authToken) => {
      try {
        const response = await fetch(`${url}/api/user/sign-in`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Authorization': `Bearer ${authToken}`, // Pass the token in the authorization header
            'Lang': 'ZH'
          },
          body: JSON.stringify({})
        });
        return await response.json();
      } catch (e) {
        return { error: e.message };
      }
    }, baseConfig.baseURL, token);

    if (signInResult.code === 200) {
      console.log(`✅ Account ${account.username} sign-in successful! Message:`, signInResult.message);
    } else {
      console.log(`ℹ️ Account ${account.username} sign-in failed or already completed. Message:`, signInResult.message);
    }
    
    return true;

  } catch (error) {
    console.error(`❌ Process failed for account ${account.username}:`, error.message);
    return false;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

// Get accounts from environment variables
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

// Main execution function
async function main() {
  try {
    console.log('🚀 Starting automated sign-in script...');
    
    const accounts = getAccounts();
    console.log(`📋 Found ${accounts.length} account(s) to process.`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const [index, account] of accounts.entries()) {
      const success = await processAccount(account);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      if (index < accounts.length - 1) {
        const delay = 5000 + Math.floor(Math.random() * 10000); // 5-15 seconds
        console.log(`⏳ Waiting ${delay / 1000}s before processing the next account...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log(`\n📊 All accounts processed.`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    
    if (failCount > 0) {
      process.exit(1); // Exit with a non-zero code to indicate failure in GitHub Actions
    }
    
  } catch (error) {
    console.error('❌ Script execution failed:', error.message);
    process.exit(1);
  }
}

// Local testing setup
if (process.env.NODE_ENV !== 'production') {
  process.env.ACCOUNTS = JSON.stringify([
    { "username": "your_email@example.com", "password": "your_password" },
    // Add other accounts for testing if needed
  ]);
}

main();