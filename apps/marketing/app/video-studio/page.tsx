import Link from "next/link";
import { VideoStudio } from "../../components/VideoStudio";
import "./studio.css";
export default function VideoStudioPage() {
  return (
    <section className="section">
      <p className="eyebrow">KXRA Video Studio · free browser tool</p>
      <h1>Your photos. A clearer property story.</h1>
      <p>
        Create a short branded photo video on your own device. Arrange up to
        eight images, add factual captions and export. No invented interiors. No
        upload to KXRA.
      </p>
      <p>
        Need a managed content service?{" "}
        <Link href="/contact">Discuss your listing content</Link>.
      </p>
      <VideoStudio />
      <details>
        <summary>Watch a clearly labelled example</summary>
        <p>
          This sample uses fictional illustrations, not a client's listing or
          available property.
        </p>
        <video
          className="sample-video"
          controls
          preload="none"
          src="/samples/kxra-property-demo.mp4"
          aria-label="Fictional property video example"
        />
      </details>
    </section>
  );
}
