<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1kKnUAfJ9j-8NUlTuLW57MsB0sMMyUgDm

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set required env vars in `.env` (or Vercel project env):
   - `VITE_GEMINI_API_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `X_API_BEARER_TOKEN` (Twitter/X fetch & search)
   - `JUSTONEAPI_TOKEN` and/or `TIKHUB_API_TOKEN` (Xiaohongshu fetch/search, supports fallback)
   - Optional: `XHS_NOTE_PROVIDER=auto|justone|tikhub` (default `auto`, for single-note fetch)
   - Optional: `XHS_SEARCH_PROVIDER=auto|justone|tikhub` (default `auto`, for keyword search)
   - Optional: `TIKHUB_XHS_SEARCH_PATH` (default `/api/v1/xiaohongshu/web_v2/fetch_search_notes`)
3. Run the app:
   `npm run dev`
 
