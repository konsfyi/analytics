import Link from "next/link";
import { Track } from "@konsfyi/analytics/next";

export default function Home() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Home</h1>
      <p>
        <Link href="/about">About</Link>
      </p>
      <p>
        <Track event="open-dashboard">
          <Link href="/analytics">The numbers</Link>
        </Track>
      </p>
    </main>
  );
}
