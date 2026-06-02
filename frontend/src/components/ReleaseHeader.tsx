export default function ReleaseHeader() {
  return (
    <section className="release-header">
      <div>
        <h1>Release 2026.01</h1>
        <p>Rocq 9.1.0 · rocq-prover/platform · main</p>
      </div>

      <div className="progress-block">
        <span>Overall Progress</span>
        <strong>82%</strong>

        <div className="progress-bar">
          <i style={{ width: "82%" }} />
        </div>

        <small>Estimated release: in 12 days</small>
      </div>

      <div className="next-card">
        <span>Next milestone</span>
        <strong>CI Build</strong>
        <small>4 failing packages</small>
      </div>
    </section>
  );
}
