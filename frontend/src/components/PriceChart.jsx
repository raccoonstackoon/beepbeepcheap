import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import './PriceChart.css';

export default function PriceChart({ data }) {
  // Format data for the chart
  const chartData = data.map(entry => ({
    date: new Date(entry.checked_at).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }),
    fullDate: new Date(entry.checked_at).toLocaleString(),
    price: entry.price
  }));

  // Calculate min/max for better Y-axis scaling
  const prices = data.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1 || maxPrice * 0.1;

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip">
          <p className="tooltip-price">£{payload[0].value.toFixed(2)}</p>
          <p className="tooltip-date">{payload[0].payload.fullDate}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="price-chart">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#5be9b5" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#5be9b5" stopOpacity={0}/>
            </linearGradient>
          </defs>
          
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="rgba(255,255,255,0.08)" 
            vertical={false}
          />
          
          <XAxis 
            dataKey="date" 
            stroke="#6b6762"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          
          <YAxis 
            stroke="#6b6762"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={[minPrice - padding, maxPrice + padding]}
            tickFormatter={(value) => `£${value.toFixed(0)}`}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          {/* Reference line for lowest price */}
          <ReferenceLine 
            y={minPrice} 
            stroke="#5be9b5" 
            strokeDasharray="5 5"
            strokeOpacity={0.5}
          />
          
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#5be9b5"
            strokeWidth={2}
            dot={{ 
              fill: '#5be9b5', 
              strokeWidth: 2,
              r: 4
            }}
            activeDot={{ 
              r: 6, 
              fill: '#5be9b5',
              stroke: '#fff',
              strokeWidth: 2
            }}
          />
        </LineChart>
      </ResponsiveContainer>
      
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-line lowest"></span>
          <span>Lowest price: £{minPrice.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

