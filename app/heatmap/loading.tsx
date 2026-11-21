import styles from "./heatmap.module.css";

export default function HeatmapLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9" role="status" aria-label="Loading stock heatmap">
      <div className="skeleton mb-3 h-9 w-52 rounded" />
      <div className="skeleton mb-8 h-4 w-64 rounded" />
      <div className={`${styles.board} skeleton`} />
    </div>
  );
}
