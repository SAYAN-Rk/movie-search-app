# Movie Search App

A simple front-end app that searches movies using the OMDb API and displays details.

## Features
- Search movies by title using OMDb API.
- View search results with poster, title and year.
- Click a result to open a detail modal with plot, cast, director, ratings.
- Responsive layout and simple glassmorphism styling.
- "Load more" support (OMDb paginates 10 results per page).

## Setup
1. Clone or download this folder.
2. Obtain an OMDb API key at https://www.omdbapi.com/.
3. Replace `YOUR_OMDB_API_KEY` in `script.js` with your key.
4. Run a simple server in the project folder:
   - VS Code: Use Live Server extension (recommended).
   - Or: `python -m http.server 5500` and open `http://localhost:5500`.
5. Open `index.html` and search!

## Notes / Troubleshooting
- If CSS is not loading: ensure `style.css` filename and path match and both files are in the same directory. Clear cache or use Ctrl+F5.
- If fetch calls fail: check browser console for CORS or network errors. Using a local server avoids some file:// restrictions.
- OMDb free plan has limits; if you get API errors, verify your key and quota.

## Optional improvements
- Add favorites (localStorage).
- Infinite scroll or better pagination UI.
- Add spinner animations.
- Add caching to reduce API calls.
