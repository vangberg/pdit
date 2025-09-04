import React from 'react'

const previewData = [
  {
    type: 'table',
    content: {
      title: 'Sales Data',
      table: [
        ['Month', 'Revenue', 'Units'],
        ['Jan', '$12,400', '124'],
        ['Feb', '$9,800', '98'],
        ['Mar', '$15,200', '152']
      ]
    }
  },
  {
    type: 'plot',
    content: {
      title: 'Temperature Trend',
      data: [23, 28, 31, 35, 29, 26, 24]
    }
  },
  {
    type: 'array',
    content: {
      title: 'User IDs',
      array: [1001, 1024, 1087, 1156, 1203, 1299, 1345]
    }
  },
  {
    type: 'table',
    content: {
      title: 'Server Status',
      table: [
        ['Service', 'Status', 'Uptime'],
        ['API', 'Online', '99.9%'],
        ['DB', 'Online', '99.8%'],
        ['Cache', 'Warning', '97.2%']
      ]
    }
  },
  { type: 'empty' },
  {
    type: 'plot',
    content: {
      title: 'Memory Usage',
      data: [45, 52, 48, 61, 58, 43, 39, 55]
    }
  },
  {
    type: 'array',
    content: {
      title: 'Colors',
      array: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57']
    }
  },
  { type: 'empty' },
  {
    type: 'table',
    content: {
      title: 'Network Stats',
      table: [
        ['Metric', 'Value', 'Change'],
        ['Latency', '45ms', '+2ms'],
        ['Bandwidth', '1.2GB/s', '-0.1'],
        ['Errors', '0.01%', '-0.02%']
      ]
    }
  },
  {
    type: 'plot',
    content: {
      title: 'CPU Load',
      data: [12, 18, 23, 19, 14, 21, 16, 25, 20]
    }
  },
  {
    type: 'array',
    content: {
      title: 'Recent Files',
      array: ['config.json', 'app.log', 'backup.sql', 'cache.tmp']
    }
  }
]

export function Preview() {
  return (
    <div id="preview">
      <div className="preview-content">
        {previewData.map((item, index) => {
          if (item.type === 'empty') {
            return <div key={index} className="preview-line empty-line"></div>
          }

          if (!item.content) return null

          return (
            <div key={index} className="preview-line" data-line={index + 1}>
              {item.type === 'table' && item.content.table && (
                <table className="preview-table">
                  <tbody>
                    {item.content.table.map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex === 0 ? 'header-row' : ''}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {item.type === 'plot' && item.content.data && (
                <div className="plot-chart">
                  {item.content.data.map((value, i) => (
                    <div 
                      key={i} 
                      className="plot-bar" 
                      style={{ 
                        height: `${(value / Math.max(...item.content.data!)) * 100}%`
                      }}
                    ></div>
                  ))}
                </div>
              )}

              {item.type === 'array' && item.content.array && (
                <div className="array-items">
                  {item.content.array.map((arrayItem, i) => (
                    <span key={i} className="array-item">{arrayItem}</span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}