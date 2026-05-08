import Link from "next/link";
import AddBookForm from "@/components/AddBookForm";

export default function AddBookPage() {
  return (
    <main className="container">
      <p style={{ margin: 0 }}>
        <Link href="/">← Library</Link>
      </p>
      <h1>Add a book</h1>
      <p className="subtitle">
        Search Open Library to autofill, or skip and type the details yourself.
      </p>
      <AddBookForm />
    </main>
  );
}
