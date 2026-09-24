# Anubandh

**Read your contract with the receipts.** Every obligation in your document, traced back to the exact words it came from. Information, not legal advice.

Live at [anubandh-zeta.vercel.app](https://anubandh-zeta.vercel.app)

## What's new (September 2026)

This update is mostly about trust: the app should work every time, tell you the truth, and look after your document.

### Uploading just works now

- Some uploads used to fail on the first try and then work on the second. The app was running an extra check that didn't have time to finish when the AI service was slow. That check is gone, and reading a document now has room to retry.
- If the connection wobbles for a moment while your document is being read, the app quietly checks again instead of showing you an error.
- On the live site, every upload was failing because of a missing setting. It's fixed, and the site now refuses to go live if an essential setting is ever missing again.

### More accurate citations

- A clause sitting right next to a page break could be cited to the wrong page. The page number you see now is the page it's actually on.

### Your privacy

- Refreshing the page gives you a clean slate and removes the document you uploaded.
- The error screen used to say "Nothing has been kept" even when your document had already been saved. It no longer claims that.
- To stop misuse, there's a limit on how many documents can be read from any one connection each hour. We don't keep a record of who you are to do it: your network address is scrambled before it's stored.

### Safer and faster

- Your browser now blocks a whole family of common attacks by default. The app's building blocks are checked for known security problems on every change, and again every week.
- A heavy 3D animation library that loaded in the background is gone, so the site is about 770 KB lighter on desktop.
- If a reading has to be retried, it reuses the work already done instead of starting over.

### A fresh look

- Cards now have a warm cream, frosted-glass finish with a subtle navy tint. Every piece of text on them was measured to stay easy to read.

### Checked on every change

- More than 70 automated tests run every time the code changes. They cover accessibility, colour contrast and leaked secrets, and they prove one person can never see another person's document.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
