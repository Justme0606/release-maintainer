import { useNavigate, useParams } from "react-router-dom";
import { packages } from "../data/mockPackages";

export default function PackageTable() {
  const navigate = useNavigate();
  const { releaseId } = useParams();

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Packages (142)</h2>

        <div className="filters">
          <button className="active">All</button>
          <button>Ready</button>
          <button>Waiting</button>
          <button>Blocked</button>
          <button>Issue Open</button>
          <button>Build Failed</button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Package</th>
            <th>Pick Version</th>
            <th>OPAM Version</th>
            <th>Git Tag</th>
            <th>Issue</th>
            <th>Build</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {packages.map((pkg) => (
            <tr
              className="clickable-row"
              key={pkg.name}
              onClick={() =>
                navigate(`/releases/${releaseId}/packages/${pkg.name}`)
              }
            >
              <td>
                <strong>{pkg.name}</strong>
                <small>{pkg.repo}</small>
              </td>
              <td>{pkg.pick}</td>
              <td>{pkg.opam}</td>
              <td>{pkg.tag}</td>
              <td>
                <span className="linkish">{pkg.issue}</span>
              </td>
              <td>
                <span className={`pill ${pkg.build}`}>{pkg.build}</span>
              </td>
              <td>
                <span className={`pill ${pkg.status}`}>{pkg.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
