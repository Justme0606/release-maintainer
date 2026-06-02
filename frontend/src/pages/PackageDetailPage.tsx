import { Link, useParams } from "react-router-dom";
import { packages } from "../data/mockPackages";

export default function PackageDetailPage() {
  const { packageName } = useParams();

  const pkg = packages.find((item) => item.name === packageName);

  if (!pkg) {
    return (
      <section className="panel">
        <h1>Package not found</h1>
        <Link to="/">Back to dashboard</Link>
      </section>
    );
  }

  return (
    <section className="panel">
      <Link to="/" className="linkish">
        ← Back to dashboard
      </Link>

      <h1>{pkg.name}</h1>
      <p>{pkg.repo}</p>

      <div className="kpi-grid">
        <div className="kpi blue">
          <div>
            <span>Selected version</span>
            <strong>{pkg.pick}</strong>
          </div>
        </div>

        <div className="kpi green">
          <div>
            <span>Latest OPAM</span>
            <strong>{pkg.opam}</strong>
          </div>
        </div>

        <div className="kpi purple">
          <div>
            <span>Latest Git tag</span>
            <strong>{pkg.tag}</strong>
          </div>
        </div>

        <div className="kpi yellow">
          <div>
            <span>Please Pick</span>
            <strong>{pkg.issue}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
