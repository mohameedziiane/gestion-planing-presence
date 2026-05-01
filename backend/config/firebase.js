const fs = require("fs");
const path = require("path");

const admin = require("firebase-admin");

let firebaseApp = null;

function resolveServiceAccountPath() {
  const configuredPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json";

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return path.resolve(__dirname, "..", configuredPath);
}

function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  const serviceAccountPath = resolveServiceAccountPath();

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Firebase service account file not found at ${serviceAccountPath}`
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf-8")
  );

  firebaseApp =
    admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });

  return firebaseApp;
}

function getMessaging() {
  getFirebaseApp();

  return admin.messaging();
}

module.exports = {
  getFirebaseApp,
  getMessaging,
};
