const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountkey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://eacgeolocate-default-rtdb.firebaseio.com'
});

async function listAllUsers() {
  try {
    const listUsersResult = await admin.auth().listUsers();
    
    console.log('📋 All Registered Users:\n');
    listUsersResult.users.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Admin: ${user.customClaims?.admin ? '✅ YES' : '❌ NO'}`);
      console.log('---\n');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

listAllUsers();