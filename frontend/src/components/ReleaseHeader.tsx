type ReleaseHeaderProps = {
  release: {
    id?: string;
    name?: string;
    description?: string;
    published_at?: string;
    draft?: boolean;
    prerelease?: boolean;
    status?: string;
  } | null;
};

export default function ReleaseHeader({ release }: ReleaseHeaderProps) {
  return (
    <section className="release-header">
      <div>
        <h1>Release {release?.name ?? "Loading..."}</h1>

        <p>{release?.description ?? "Loading release information..."}</p>

        {release?.status === "in_progress" && (
          <span className="status-badge">🚧 IN PROGRESS</span>
        )}

        {release?.published_at && (
          <p>Published {new Date(release.published_at).toLocaleDateString()}</p>
        )}
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
