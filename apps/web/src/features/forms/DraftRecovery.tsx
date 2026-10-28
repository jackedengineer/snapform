export function DraftRecovery({
  loading,
  onReload,
}: {
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="recovery-panel">
      <p>
        Your current edit will remain available as “Restore previous edit” after
        loading the saved version.
      </p>
      <button
        type="button"
        className="text-button"
        disabled={loading}
        onClick={onReload}
      >
        Load saved version
      </button>
    </div>
  );
}
