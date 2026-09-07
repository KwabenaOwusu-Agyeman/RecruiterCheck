# Newsletter images

Used by the weekly email. `supabase/functions/publish-weekly-newsletter` picks a
pair each week (see `imagesForWeek` in its `logic.ts`), one for the rejection
section and one for hiring trends.

Source: Unsplash. The Unsplash Licence permits free commercial use and does not
require attribution, but provenance is recorded here so the origin of every
image in this repository is traceable, and any future licence question can be
answered without guesswork.

Each file was fetched at 1200 by 630.

| File | Unsplash photo id | Used for |
| --- | --- | --- |
| reviewing-an-application.jpg | photo-1454165804606-c3d57bc86b40 | Rejection, weeks where the pair index is even |
| connected-data.jpg | photo-1639322537228-f710d846310a | Trends, weeks where the pair index is even |
| ai-systems.jpg | photo-1677442136019-21780ecad995 | Rejection, odd weeks |
| analytics-dashboard.jpg | photo-1551288049-bebda4e38f71 | Trends, odd weeks |

These four are the whole set. `piece.ts` only accepts an image under
`/newsletter/`, and the email references them absolutely at
`https://myrecruitercheck.com/newsletter/...`, so they must stay in `public/`
and stay deployed or every image in a sent issue breaks.

Adding a fifth means adding it to `IMAGE_PAIRS` in the function's `logic.ts`
with alt text, since an image with no alt text fails validation.
