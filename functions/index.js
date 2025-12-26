import express from "express";
import admin from "firebase-admin";
import dotenv from "dotenv";
import crypto from "crypto";
import rateLimit from "express-rate-limit";



dotenv.config({ path: "./secret.env" });
dotenv.config({ path: "./firebaseconfig.env" });



// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});

const db = admin.firestore();

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: "Too many requests, slow down!" }),
});

// Helper function
function quoteIdFromText(quote) {
  return crypto.createHash("sha256").update(quote.trim().toLowerCase()).digest("hex");
}

// API key check middleware
function checkApiKey(req, res, next) {
  const reqApiKey = req.header("x-api-key");
  if (!reqApiKey || reqApiKey !== process.env.KEY) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
}

// Initialize Express app
const app = express();
app.use(express.json()); // for parsing JSON bodies

// ----- ROUTES -----

// GET /random
app.get("/random", limiter, checkApiKey, async (req, res) => {
  try {
    const slug = req.query.slug;
    const quotesCol = db.collection("quotes");

    if (slug) {
      const q = quotesCol.where("slugs", "array-contains", slug);
      const snapshot = await q.get();

      if (snapshot.empty) return res.status(200).json({ error: "No quotes found" });

      const quotesArray = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const randomQuote = quotesArray[Math.floor(Math.random() * quotesArray.length)];

      const tag = slug
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      return res.json({ ...randomQuote, slug, tag });
    }

    // No slug: get a random quote from all
    const snapshot = await quotesCol.get();
    if (snapshot.empty) return res.status(404).json({ error: "No quotes found" });

    const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

    const selectedSlug = randomQuote.slugs[Math.floor(Math.random() * randomQuote.slugs.length)];
    const tag = selectedSlug
      .split("-")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return res.json({ ...randomQuote, slug: selectedSlug, tag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /quote
app.post("/quote", checkApiKey, async (req, res) => {
  try {
    const { author, quote, slugs } = req.body;

    if (!author || !quote || !slugs || !Array.isArray(slugs) || slugs.length === 0) {
      return res.status(400).json({ error: "Missing or invalid params" });
    }

    const validSlugs = [];
    const chunkSize = 10;

    for (let i = 0; i < slugs.length; i += chunkSize) {
      const chunk = slugs.slice(i, i + chunkSize);
      const tagsCol = db.collection("tags");
      const q = tagsCol.where("slug", "in", chunk);
      const snapshot = await q.get();

      snapshot.forEach(doc => validSlugs.push(doc.data().slug));
    }

    if (validSlugs.length === 0) return res.status(404).json({ error: "No valid tags found" });

    const docRef = db.collection("quotes").doc(quoteIdFromText(quote));
    await docRef.set({ author, quote, slugs: validSlugs });

    res.json({ message: "Quote added", id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /tags
app.get("/tags", limiter, checkApiKey, async (req, res) => {
  try {
    const tagsCol = db.collection("tags");
    const snapshot = await tagsCol.get();
    const tags = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(tags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /tag
app.post("/tag", limiter, checkApiKey, async (req, res) => {
  try {
    const { tag, slug, img } = req.body;
    if (!tag || !slug || !img) return res.status(400).json({ error: "Missing params" });

    const docRef = await db.collection("tags").add({ tag, slug, img });
    res.json({ message: "Tag added", id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
app.get("/health", (req, res) => {
  res.send("works fine");
});


// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
