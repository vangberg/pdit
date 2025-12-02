import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";

interface DataframeData {
  columns: string[];
  data: unknown[][];
}

interface DataframeTableProps {
  jsonData: string;
}

export const DataframeTable: React.FC<DataframeTableProps> = ({ jsonData }) => {
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 10;

  const { columns, rows } = useMemo(() => {
    const parsed: DataframeData = JSON.parse(jsonData);

    // Convert to row objects for TanStack Table
    const rows = parsed.data.map((row, rowIndex) => {
      const rowObj: Record<string, unknown> = { __rowIndex: rowIndex };
      parsed.columns.forEach((col, colIndex) => {
        rowObj[col] = row[colIndex];
      });
      return rowObj;
    });

    // Create column definitions
    const columnHelper = createColumnHelper<Record<string, unknown>>();
    const columns = parsed.columns.map((colName) =>
      columnHelper.accessor(colName, {
        header: colName,
        cell: (info) => formatCellValue(info.getValue()),
      })
    );

    return { columns, rows };
  }, [jsonData]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination: { pageIndex, pageSize },
    },
    onPaginationChange: (updater) => {
      const newState = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(newState.pageIndex);
    },
  });

  return (
    <div className="dataframe-table-container">
      <table className="dataframe-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dataframe-pagination">
        <button
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          title="First page"
        >
          &lt;&lt;
        </button>
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          title="Previous page"
        >
          &lt;
        </button>
        <div className="pagination-input-group">
          <input
            type="number"
            min={1}
            max={table.getPageCount()}
            value={table.getState().pagination.pageIndex + 1}
            onChange={(e) => {
              const page = e.target.value ? Number(e.target.value) - 1 : 0;
              table.setPageIndex(Math.min(Math.max(page, 0), table.getPageCount() - 1));
            }}
          />
          <span className="pagination-separator">/</span>
          <span className="pagination-total">{table.getPageCount()}</span>
        </div>
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          title="Next page"
        >
          &gt;
        </button>
        <button
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
          title="Last page"
        >
          &gt;&gt;
        </button>
      </div>
    </div>
  );
};

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    // Format numbers nicely
    if (Number.isInteger(value)) {
      return value.toString();
    }
    // Limit decimal places for floats
    return value.toFixed(6).replace(/\.?0+$/, "");
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  return String(value);
}
