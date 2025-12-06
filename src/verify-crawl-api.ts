import axios from 'axios';

async function testCrawlApi() {
  const baseUrl = 'http://localhost:3000'; // Assuming default port

  console.log('Testing Crawl List API...');
  try {
    const listResponse = await axios.post(`${baseUrl}/crawl/list`, {
      category: 'hotels',
      site: 'booking',
      url: 'https://www.booking.com/searchresults.html?ss=Da+Nang', // Example URL
      options: {
        maxPages: 1,
        headless: true
      }
    });
    console.log('Crawl List Response:', JSON.stringify(listResponse.data, null, 2));
  } catch (error) {
    console.error('Crawl List Failed:', error.response?.data || error.message);
  }

  // Note: We need a valid detail link to test detail API.
  // We can pick one from the list response if we were running this interactively.
  // For now, I'll just log that we need to test detail manually or use a known link.
}

testCrawlApi();
