
const axios = require('axios');

async function runTests() {
  let passed = 0;
  let total = 0;
  console.log('--- B?T Ð?U TEST API ---');

  // Test 1: T?o tài s?n (F2)
  total++;
  try {
    const res = await axios.post('http://localhost:5000/properties', {
      id: 'LS-99999',
      propertyCode: 'LS-99999',
      address: '123 Test API',
      price: 1000000,
      images: ['https://picsum.photos/seed/test/1200/800']
    });
    if (res.status === 201) {
      console.log('? [TC_WF_001] T?o tài s?n (F2 API) thành công');
      passed++;
    }
  } catch (e) {
    console.log('? [TC_WF_001] L?i t?o tài s?n: ', e.message);
  }

  // Test 2: Duy?t tài s?n (F3)
  total++;
  try {
    const res = await axios.patch('http://localhost:5000/properties/LS-99999', {
      level1_status: 'Ðu?c duy?t',
      level2_status: 'Chua niêm y?t'
    });
    if (res.status === 200) {
      console.log('? [TC_WF_005] Duy?t tài s?n (F3 API) thành công');
      passed++;
    }
  } catch (e) {
    console.log('? [TC_WF_005] L?i duy?t tài s?n: ', e.message);
  }

  // Test 3: T?o listing (F4)
  total++;
  try {
    const res = await axios.post('http://localhost:5000/listings', {
      id: 'LT-99999',
      property_id: 'LS-99999',
      title: 'Test Listing',
      listing_status: 'Ch? duy?t'
    });
    if (res.status === 201) {
      console.log('? [TC_WF_009] T?o tin dang (F4 API) thành công');
      passed++;
    }
  } catch (e) {
    console.log('? [TC_WF_009] L?i t?o tin dang: ', e.message);
  }

  // Cleanup
  try {
    await axios.delete('http://localhost:5000/properties/LS-99999');
    await axios.delete('http://localhost:5000/listings/LT-99999');
  } catch (e) {}

  console.log(--- HOÀN T?T: / PASSED ---);
}
runTests();

