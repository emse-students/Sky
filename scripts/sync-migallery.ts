/**
 * MiGallery Integration Service
 * Synchronizes profile pictures from MiGallery API to Sky database
 *
 * TODO: Implement actual MiGallery API calls when available
 */

import { getAllPeople, updatePerson } from "$lib/server/database";

interface MiGalleryPerson {
  id: string;
  photo_url?: string;
  // Add other MiGallery fields as needed
}

/**
 * Fetch person data from MiGallery API
 * @param personId - Sky person ID
 * @returns MiGallery person data or null if not found
 */
async function fetchFromMiGallery(
  personId: string,
): Promise<MiGalleryPerson | null> {
  // TODO: Replace with actual MiGallery API endpoint
  const MIGALLERY_API =
    process.env.MIGALLERY_API_URL || "https://api.migallery.example/";

  try {
    const response = await fetch(`${MIGALLERY_API}/people/${personId}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as MiGalleryPerson;
  } catch (error) {
    console.error(`Failed to fetch from MiGallery for ${personId}:`, error);
    return null;
  }
}

/**
 * Download and save profile picture locally
 * @param photoUrl - URL of the photo from MiGallery
 * @param personId - Person ID for filename
 * @returns Local path to saved image
 */
async function downloadProfilePicture(
  photoUrl: string,
  personId: string,
): Promise<string> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const imagesDir = path.join(process.cwd(), "static", "images");
  await fs.mkdir(imagesDir, { recursive: true });

  const filename = `${personId}.jpg`;
  const localPath = path.join(imagesDir, filename);

  try {
    const response = await fetch(photoUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(arrayBuffer));

    console.log(`✅ Downloaded photo for ${personId}`);
    return filename;
  } catch (error) {
    console.error(`Failed to download photo for ${personId}:`, error);
    return "default.jpg";
  }
}

/**
 * Sync all profile pictures from MiGallery
 */
export async function syncAllProfilePictures(): Promise<void> {
  console.log("🖼️  Syncing profile pictures from MiGallery...\n");

  const people = getAllPeople();
  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const person of people) {
    try {
      const miGalleryData = await fetchFromMiGallery(person.id);

      if (!miGalleryData || !miGalleryData.photo_url) {
        notFound++;
        continue;
      }

      // Download and save photo
      const imageFilename = await downloadProfilePicture(
        miGalleryData.photo_url,
        person.id,
      );

      // Update database
      updatePerson(person.id, {
        image: imageFilename,
      });

      updated++;

      if (updated % 10 === 0) {
        console.log(`   Progress: ${updated} photos synchronized...`);
      }
    } catch (error) {
      console.error(`Error syncing photo for ${person.id}:`, error);
      errors++;
    }
  }

  console.log("\n📊 Sync Summary:");
  console.log(`   ✅ ${updated} photos updated`);
  console.log(`   ⚠️  ${notFound} not found in MiGallery`);
  console.log(`   ❌ ${errors} errors`);
  console.log(`   📁 Total people: ${people.length}`);
  console.log("\n✨ Sync complete!");
}

/**
 * Sync a single person's profile picture
 */
export async function syncPersonProfilePicture(
  personId: string,
): Promise<boolean> {
  console.log(`🖼️  Syncing profile picture for ${personId}...`);

  try {
    const miGalleryData = await fetchFromMiGallery(personId);

    if (!miGalleryData || !miGalleryData.photo_url) {
      console.log(`   ⚠️  Not found in MiGallery`);
      return false;
    }

    const imageFilename = await downloadProfilePicture(
      miGalleryData.photo_url,
      personId,
    );

    updatePerson(personId, {
      image: imageFilename,
    });

    console.log(`   ✅ Photo updated`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error:`, error);
    return false;
  }
}

// CLI usage
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Sync all
    await syncAllProfilePictures();
  } else {
    // Sync specific person
    const personId = args[0];
    await syncPersonProfilePicture(personId);
  }
}
