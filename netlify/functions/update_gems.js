// update_gems.js
const admin = require('firebase-admin');

// يتم استيراد المفتاح السري من متغير البيئة
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// 🚨 دالة مساعدة لفك التشفير السداسي العشري
function hexToSignedInt(hexStr) {
    // 1. تحويل النص السداسي عشري إلى بايتس (Buffer)
    const bytes = Buffer.from(hexStr, 'hex');
    // 2. تحويل البايتس إلى نص (مثلاً: "100" أو "-50")
    const numString = bytes.toString('utf8');
    // 3. تحويل النص إلى عدد صحيح (يقبل الإشارة السالبة)
    return parseInt(numString, 10); 
}


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: "Method Not Allowed" }),
        };
    }

    try {
        const { user_id, encrypted_gems_hex } = JSON.parse(event.body);

        if (!user_id || typeof encrypted_gems_hex !== 'string') {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing user_id or encrypted_gems_hex." }),
            };
        }
        
        // 🚨 فك التشفير هنا
        const gems_change = hexToSignedInt(encrypted_gems_hex);

        if (isNaN(gems_change)) {
             return {
                statusCode: 400,
                body: JSON.stringify({ message: "Invalid Hexadecimal value provided." }),
            };
        }

        // 3. تحديث البيانات في Firestore (باستخدام القيمة gems_change)
        const userRef = db.collection('users').doc(user_id);
        
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(userRef);
            
            // القيمة الحالية للجواهر
            const currentGems = doc.exists ? (doc.data().gems || 0) : 0;
            // القيمة الجديدة = القيمة الحالية + التغيير (سواء كان موجب أو سالب)
            const newGems = currentGems + gems_change;
            
            // التأكد من أن الجواهر لا تقل عن صفر (قاعدة بسيطة)
            const finalGems = Math.max(0, newGems); 

            if (!doc.exists) {
                transaction.set(userRef, {
                    gems: finalGems,
                    last_update: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                transaction.update(userRef, { 
                    gems: finalGems,
                    last_update: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, new_gems: finalGems }),
        };

    } catch (error) {
        console.error("Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal server error during update." }),
        };
    }
};