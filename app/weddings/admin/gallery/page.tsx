import { requireWeddingStaff } from "../../staff-auth";
import { listAllWeddingGalleryImages } from "@/db/weddingSite";
import { AdminNav } from "../AdminNav";
import { GalleryManager } from "./GalleryManager";

export const dynamic = "force-dynamic";

export default async function WeddingGalleryAdminPage() {
  const role = await requireWeddingStaff(["wedding_desk", "antonio"], "/weddings/admin/gallery");
  const images = await listAllWeddingGalleryImages();

  return (
    <main className="staff-workspace">
      <AdminNav role={role} active="/weddings/admin/gallery" />
      <section className="staff-workspace-content">
        <div className="staff-page-intro">
          <div><span className="section-kicker">Gallery</span><h1>Real wedding photos.</h1></div>
          <p>Paste a link to an already-hosted photo (from a photo host, cloud drive, or WeddingWire once downloaded and re-hosted). Every photo needs a photographer credit where the name is known, and an image without confirmed rights should stay in draft.</p>
        </div>
        <GalleryManager initialImages={images} />
      </section>
    </main>
  );
}
