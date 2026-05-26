export async function checkGeminiHandler(_req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not configured (debug)');
    return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
  }

  try {
    console.log('🔎 [debug/gemini] Sending lightweight ping to Gemini...');
    const start = Date.now();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Ping. Reply with the single word: PONG' },
              ],
            },
          ],
        }),
      }
    );

    const elapsed = Date.now() - start;
    const text = await response.text();
    console.log(`⏱️  [debug/gemini] responded in ${elapsed}ms status=${response.status}`);
    return res.status(200).json({ elapsedMs: elapsed, status: response.status, snippet: text.substring(0, 300) });
  } catch (error) {
    console.error('❌ [debug/gemini] request failed:', error?.message || error);
    return res.status(500).json({ error: 'Request failed', details: error?.message || String(error) });
  }
}
