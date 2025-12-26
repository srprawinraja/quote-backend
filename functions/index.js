import * as functions from "firebase-functions";
import admin from "firebase-admin";

import dotenv from "dotenv";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

dotenv.config();

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  addDoc,
} from "firebase/firestore";


const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: process.env.AUTH_DOMAIN,
  projectId: process.env.PROJECT_ID,
  storageBucket: process.env.STORAGE_BUCKET,
  messagingSenderId: process.env.MESSAGING_SENDER_ID,
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

dotenv.config({ path: "../secret.env" });

// Now you can access your secrets
const apikey = process.env.KEY;

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Too many requests, slow down!" });
  },
});

function quoteIdFromText(quote) {
  return crypto
    .createHash("sha256")
    .update(quote.trim().toLowerCase())
    .digest("hex");
}
export const random = functions.https.onRequest(limiter, async (req, res) => {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
  const reqApiKey = req.header("x-api-key"); // or req.headers['x-api-key']
  if (!reqApiKey || reqApiKey !== apikey) {
    return res.status(401).send("Invalid token");
  }

  // continue with your function logic

  const slug = req.query.slug;
  if (slug) {
    const quotesCol = collection(db, "quotes");

    // Build the query
    const q = query(quotesCol, where("slugs", "array-contains", slug));

    // Execute the query
    const quotesSnapshot = await getDocs(q);

    if (quotesSnapshot.empty) {
      return res.status(200).json({ error: "No quotes found" });
    }

    // Convert snapshot to array
    const quotesArray = quotesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Pick a random quote
    const randomQuote =
      quotesArray[Math.floor(Math.random() * quotesArray.length)];

    const tag = slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return res.status(200).json({
      id: randomQuote.id,
      author: randomQuote.author,
      quote: randomQuote.quote,
      slug: slug,
      tag: tag,
    });
  }

  const quotesCol = collection(db, "quotes");

  // Fetch all documents
  const querySnapshot = await getDocs(quotesCol);
  if (querySnapshot.empty) {
    return res.status(404).json({ error: "No quotes found" });
  }
  // Convert documents to array
  const quotes = querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  // Get one random quote
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  const selectedSlug =
    randomQuote.slugs[Math.floor(Math.random() * randomQuote.slugs.length)];

  const tag = selectedSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return res.status(200).json({
    id: randomQuote.id,
    author: randomQuote.author,
    quote: randomQuote.quote,
    slug: selectedSlug,
    tag: tag,
  });
});

export const quote = functions.https.onRequest(limiter, async (req, res) => {
  try {
    if (req.method !== "POST")
      return res.status(405).send("Method Not Allowed");

    const reqApiKey = req.header("x-api-key"); // or req.headers['x-api-key']
    if (!reqApiKey || reqApiKey !== apikey) {
      return res.status(401).send("Invalid token");
    }
    const author = req.body.author;
    const quote = req.body.quote;
    const slugs = req.body.slugs;
    if (
      !quote ||
      !author ||
      !slugs ||
      !Array.isArray(slugs) ||
      slugs.length === 0
    ) {
      return res.status(400).send("params missing or invalid");
    }
    const validSlugs = [];
    const chunkSize = 10;

    // Split slugs into chunks of 10
    for (let i = 0; i < slugs.length; i += chunkSize) {
      const chunk = slugs.slice(i, i + chunkSize);
      const tagsCol = collection(db, "tags");

      // Build the query
      const q = query(tagsCol, where("slug", "in", chunk));

      // Execute the query
      const querySnapshot = await getDocs(q);

      querySnapshot.forEach((doc) => {
        validSlugs.push(doc.data().slug);
      });
    }

    if (validSlugs.length === 0) {
      return res.status(404).send({ message: "No valid tags found" });
    }
    const docRef = doc(db, "quotes", quoteIdFromText(quote));

    // Set the document data
    await setDoc(docRef, {
      author: author,
      quote: quote,
      slugs: validSlugs,
    });
    console.log("Document written with ID:", docRef.id);
    res.send(`Document written with ID: ${docRef.id}`);
  } catch (e) {
    console.error("Error adding document: ", e);
    res.status(500).send("Error adding document");
  }
});

export const tags = functions.https.onRequest(limiter, async (req, res) => {
  if (req.method === "GET") {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
    const reqApiKey = req.header("x-api-key"); // or req.headers['x-api-key']
    if (!reqApiKey || reqApiKey !== apikey) {
      return res.status(401).send("Invalid token");
    }
    const tagsCol = collection(db, "tags");

    // Fetch all documents
    const querySnapshot = await getDocs(tagsCol);
    // Convert documents to array of objects
    const tags = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json(tags);
  }
});

export const tag = functions.https.onRequest(limiter, async (req, res) => {
  try {
    if (req.method !== "POST")
      return res.status(405).send("Method Not Allowed");
    const reqApiKey = req.header("x-api-key"); // or req.headers['x-api-key']
    if (!reqApiKey || reqApiKey !== apikey) {
      return res.status(401).send("Invalid token");
    }
    const tag = req.body.tag;
    const slug = req.body.slug;
    const img = req.body.img;

    if (!tag || !slug || !img) {
      return res.status(405).send("params missing");
    }
    const tagsCol = collection(db, "tags");

    // Add a new document with auto-generated ID
    const docRef = await addDoc(tagsCol, {
      tag: tag,
      slug: slug,
      img: img,
    });
    console.log("Document written with ID:", docRef.id);
    res.send(`Document written with ID: ${docRef.id}`);
  } catch (e) {
    console.error("Error adding document: ", e);
    res.status(500).send("Error adding document");
  }
});
