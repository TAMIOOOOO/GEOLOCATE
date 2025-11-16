const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // rename if needed

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://your-project-default-rtdb.firebaseio.com'
});

async function setAdminClaim(uid) {
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  console.log(`Admin claim set for user: ${uid}`);
}

// Replace this with the UID of the user you want to make admin
setAdminClaim('5zB3RDrpTQXNwRx97DMzFaWeiSr2');
