# Kurti image, admin editing and uploads

The exact supplied file `Khwab Stitch Teal Kurti Design Board.png` is included at `client/public/design-library/teal-kurti-board.png`. It is the updated board with a notched V neck, keyhole back, tie/tassel and four stitching rates. The image is preserved; the gallery shows crops without generating replacement garment images.

## 1. Get admin access

1. Run `npm run dev` from the project folder and create your account on the website using your own email/password.
2. In another terminal at the project root, run this command with that registered email:

   ```powershell
   npm --prefix server run admin:provision -- "your-registered-email@example.com"
   ```

3. Sign out, sign in again and open `/admin/designs`.

The admin email is stored in the user account in MongoDB. It does **not** go in `.env`. The role is granted by the trusted local command; changing browser storage cannot grant admin access. Do not share your password or put it in a command.

At the configuration check for this task, the connected development database had no active administrator and no `KS-TEAL-01` design. No account was promoted without an identified registered email. No catalogue record was published to that database by this task.

## 2. Add the supplied kurti now — no ImageKit required

1. In **Admin → Designs**, click **Use teal kurti template**.
2. The original board, seven views, English/Hindi description, design details, notes and four prices are filled in.
3. Review the preview crops and the live customer preview. You can change labels in English/Hindi, move/remove previews, choose the cover, edit the crop percentages and change every price/detail.
4. Choose **Draft** while reviewing, or **Published** to make the design appear in the public collection. Click **Save design**.
5. Edit the saved entry for later changes. Do not create the same code/slug again.

The included board is a known public application asset. Saving it attaches one media-library record; it does not upload the board to a cloud provider. Multiple previews reference that one asset. Deleting an unused bundled media-library entry removes its database entry, not the template file from the application. Replacing it with a newly uploaded image uses the normal upload workflow below.

The prices transcribed from the updated local image are:

| Service | Stitching price |
|---|---:|
| Simple kurti stitching | ₹300 |
| With neck & sleeve design | ₹400 |
| With back design — tie / tassel / button | ₹450 |
| With embroidery / handwork | ₹550+ |

The ₹300 rate does **not** include the entire embroidery shown. The catalogue explicitly says that fabric is supplied by the customer, this is a stitching service, the outfit/trousers/accessories are references, and the final price/date require review and customer quote acceptance. The starting price always matches the lowest rate entered by the admin. Prices remain integer paise in the API.

## 3. Configure ImageKit for additional image uploads

The supplied board works now without this step. New uploads still require ImageKit.

1. Open the [ImageKit dashboard](https://imagekit.io/dashboard). Sign up/sign in if needed.
2. Copy your public URL endpoint from [URL Endpoints](https://imagekit.io/dashboard/url-endpoints), normally `https://ik.imagekit.io/your_imagekit_id`.
3. Obtain your private API key from [Developer → API keys](https://imagekit.io/dashboard/developer/api-keys).
4. Put the real values in **server/.env** only:

   ```dotenv
   IMAGEKIT_PRIVATE_KEY=your_real_private_key
   IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_imagekit_id
   ```

5. Restart the server (`npm run dev` if starting both applications from the root).
6. In **Admin → Designs**, open the entry and choose **Upload catalogue image**. JPEG, PNG or WebP up to 5 MiB is accepted; processing also enforces a 24-megapixel limit. Pick a cover, label each view, check the live preview and save.

Keep the private key out of `client/.env`, frontend code and chat messages. Public catalogue uploads do not require changing the existing private-reference verification setting. Customer private-reference uploads retain their separate privacy gate.

The endpoint setting was still a placeholder/unconfigured when this task was checked. The private-key value was not displayed or tested against the live service. Live ImageKit upload/delete has not been verified by this feature work. [Official URL endpoint guidance](https://imagekit.io/docs/integration/react) and [API-key guidance](https://imagekit.io/docs/api-keys).

## What else to fill in before taking real stitching work

- Confirm fabric length **and width**, lining, trims and whether the embroidery is machine work or handwork. Do not guess fabric quantity from a photo.
- Confirm a realistic turnaround after fabric/design review; the editor includes fields for fabric requirements and delivery information.
- State the fitting/trial and alteration policy, pickup/delivery arrangements and any charges with the owner. Keep final amounts/dates in the existing quote-acceptance workflow.

## Optional trusted operator import

After provisioning one administrator, a developer can preview the exact import from the project root:

```powershell
npm --prefix server run design:import -- --file "C:\Users\HP\Downloads\Khwab Stitch Teal Kurti Design Board.png" --data "../client/src/data/teal-kurti.json" --bundled --publish
```

That command does not write. Add `--execute` only when you intend to create the catalogue entry. If several administrators exist, add `--owner "registered-admin@example.com"`. The importer never overwrites an existing design code. `--bundled` accepts only the exact included board bytes; omitting it uploads the file through ImageKit and requires configured credentials. Failed database creation compensates an ImageKit upload. The normal admin editor is the easier workflow for this owner.

## Implementation and verification

`client/src/data/teal-kurti.json` contains the transcribed template. `DesignGallery.jsx` renders accessible labelled views and a native modal; `DesignEditorExtras.jsx` edits details, price rows and crop metadata. `imageViews` only references attached catalogue media IDs, rejects arbitrary URLs and validates crop bounds. `designDetails`, `priceOptions`, service notes and labels support Hindi. There is no new dependency or TypeScript.

Automated checks: 74 backend and 59 frontend tests pass, with lint/build passing. Tests cover strict metadata/bounds, owner/admin denial, one asset for multiple previews, edit/save and retry behavior, no-cloud preset access, import compensation and the existing auth/order/image-security flows. Actual Chrome verification uses an isolated database and the real supplied asset; its results are recorded in `docs/readiness.md`. No customer records or deployed website were changed.
