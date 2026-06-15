import Link from "next/link";
import { getQueue, getUnqueuedWantToRead } from "@/lib/db";
import QueueManager from "@/components/QueueManager";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const [queued, unqueued] = await Promise.all([getQueue(), getUnqueuedWantToRead()]);

  return (
    <main className="container">
      <h1>Reading Queue</h1>
      <p className="subtitle">Order your &ldquo;want to read&rdquo; books. The top 5 show up as &ldquo;Up Next&rdquo; on the home page.</p>

      {queued.length === 0 && unqueued.length === 0 ? (
        <p className="empty">
          Nothing on your &ldquo;want to read&rdquo; list yet. <Link href="/library">Browse your library</Link> and
          mark something as Want to read.
        </p>
      ) : (
        <QueueManager queued={queued} unqueued={unqueued} />
      )}
    </main>
  );
}
