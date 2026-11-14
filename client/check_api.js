
const API_URL = 'http://localhost:5002/api/trains';

async function checkConnection() {
    console.log(`Checking connection to: ${API_URL}`);

    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (!response.ok) {
            console.error('ERROR: Connection failed or route not found');
            console.error('Status:', response.status);
            console.error('Data:', data);
            return;
        }

        console.log('SUCCESS: Server is reachable!');
        console.log('Status:', response.status);
        console.log('Data count:', Array.isArray(data) ? data.length : 'Not an array');
    } catch (error) {
        console.error('ERROR: Connection failed or route not found');
        console.error('Message:', error.message);
    }
}

checkConnection();
