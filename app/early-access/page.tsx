import { EarlyAccessWaitlist } from "@/components/EarlyAccessWaitlist";
import { Nav } from "@/components/Nav";

export default function EarlyAccessPage({ searchParams }: { searchParams: { interest?: string } }) {
  const interestId = typeof searchParams.interest === "string" && searchParams.interest.length <= 64
    ? searchParams.interest
    : undefined;

  return (
    <main className="shell">
      <Nav publicOnly />
      <section className="wrap" style={{ maxWidth: 660 }}>
        <EarlyAccessWaitlist interestId={interestId} />
      </section>
    </main>
  );
}
