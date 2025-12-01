import React from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { DataFrameData } from './execution-backend-python';

interface InteractiveTableProps {
  data: DataFrameData;
}

export function InteractiveTable({ data }: InteractiveTableProps) {
  // Convert columns to ag-grid column definitions
  const columnDefs: ColDef[] = data.columns.map((col) => ({
    field: col,
    sortable: true,
    filter: true,
    resizable: true,
  }));

  // Convert rows to objects with column names as keys
  const rowData = data.rows.map((row) => {
    const rowObj: Record<string, any> = {};
    data.columns.forEach((col, idx) => {
      rowObj[col] = row[idx];
    });
    return rowObj;
  });

  return (
    <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
      <AgGridReact
        columnDefs={columnDefs}
        rowData={rowData}
        pagination={true}
        paginationPageSize={20}
        paginationPageSizeSelector={[10, 20, 50, 100]}
        domLayout="normal"
      />
    </div>
  );
}
