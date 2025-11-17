// server/admin-setup.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountkey.json'); // Note: lowercase 'k'

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://eacgeolocate-default-rtdb.firebaseio.com' // Your actual database URL
});

async function setAdminClaim(uid) {
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log('✅ Admin claim set successfully!');
    console.log(`User UID: ${uid}`);
    
    // Verify the claim was set
    const user = await admin.auth().getUser(uid);
    console.log('Verified admin claim:', user.customClaims);
    console.log('\n⚠️  IMPORTANT: User must log out and log back in for changes to take effect!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting admin claim:', error.message);
    process.exit(1);
  }
}

// Replace this with the UID of the user you want to make admin
setAdminClaim('F5bKitpTF4gnlLvydYFuGhEAVA92');