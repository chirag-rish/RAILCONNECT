
import {
  Bar,
  Pie,
} from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
);

interface ChartDataProps {
  labels: string[];
  values: number[];
}

export function YieldDistributionChart({ data }: { data: ChartDataProps }) {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: "Yield",
        data: data.values,
        backgroundColor: ["#2563eb", "#64748b", "#e2e8f0"],
        borderWidth: 1,
      },
    ],
  };

  return <Pie data={chartData} />;
}

export function AssetUtilizationChart({ data }: { data: ChartDataProps }) {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: "Utilization",
        data: data.values,
        backgroundColor: "#2563eb",
      },
    ],
  };

  return <Bar data={chartData} />;
}
