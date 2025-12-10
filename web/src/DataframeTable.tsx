import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from "@tanstack/react-table";

interface DataframeData {
  columns: string[];
  data: unknown[][];
}

interface DataframeTableProps {
  jsonData: string;
  printMode?: boolean;
}

export const DataframeTable: React.FC<DataframeTableProps> = ({ jsonData, printMode = false }) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

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

  // In print mode, show all rows; otherwise paginate
  const pageSize = printMode ? rows.length : 10;

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: printMode ? undefined : getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      pagination: { pageIndex, pageSize },
      sorting,
      globalFilter,
    },
    onPaginationChange: (updater) => {
      const newState = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(newState.pageIndex);
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "auto",
  });

  return (
    <div className="dataframe-table-container">
      <table className="dataframe-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{ cursor: header.column.getCanSort() ? "pointer" : "default", userSelect: "none" }}
                  title={
                    header.column.getCanSort()
                      ? header.column.getIsSorted() === "desc"
                        ? "Sorted descending. Click to sort ascending."
                        : header.column.getIsSorted() === "asc"
                        ? "Sorted ascending. Click to unsort."
                        : "Click to sort ascending."
                      : undefined
                  }
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    <span style={{ fontSize: "0.85em", opacity: 0.6, flexShrink: 0 }}>
                      {header.column.getIsSorted() === "asc"
                        ? "▲"
                        : header.column.getIsSorted() === "desc"
                        ? "▼"
                        : ""}
                    </span>
                  </div>
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
      {!printMode && (
        <div className="dataframe-toolbar">
          <input
            type="text"
            placeholder="Filter..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="dataframe-filter-input"
          />
          <div className="dataframe-toolbar-pagination">
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
            <div className="dataframe-toolbar-pagination-group">
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
              <span className="dataframe-toolbar-pagination-separator">/</span>
              <span className="dataframe-toolbar-pagination-total">{table.getPageCount()}</span>
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
      )}
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
