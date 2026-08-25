import { Archive, Edit3, FolderOpen, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { CreateCustomerInput, Customer } from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

interface Props {
  customers: Customer[];
  busy: boolean;
  onCreate: (input: CreateCustomerInput) => Promise<void>;
  onUpdate: (customerId: string, input: Partial<CreateCustomerInput>) => Promise<void>;
  onArchive: (customerId: string) => Promise<void>;
  onOpen: (customerId: string) => void;
}

export function CustomersPage({ customers, busy, onCreate, onUpdate, onArchive, onOpen }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.companyName, customer.phone, customer.email, customer.address].some((value) => value?.toLowerCase().includes(query))
    );
  }, [customers, search]);

  return (
    <section className="saas-page">
      <PageHeader
        title="Customers"
        subtitle="CRM-lite customer records for this workspace"
        action={
          <button className="home-new-btn" onClick={() => setCreating(true)}>
            <Plus /> New Customer
          </button>
        }
      />
      <div className="search-row">
        <Search />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers..." />
      </div>
      <section className="saas-panel">
        <table className="project-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Projects</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="project-empty">No customers found</td>
              </tr>
            ) : (
              filtered.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <strong>{customer.name}</strong>
                    {customer.companyName && <small>{customer.companyName}</small>}
                  </td>
                  <td>{customer.phone || "-"}</td>
                  <td>{customer.email || "-"}</td>
                  <td>{customer._count?.projects ?? customer.projects?.length ?? 0}</td>
                  <td className="project-actions">
                    <button onClick={() => onOpen(customer.id)}>
                      <FolderOpen /> Open
                    </button>
                    <button title="Edit customer" onClick={() => setEditing(customer)}>
                      <Edit3 />
                    </button>
                    <button
                      className="danger"
                      title="Archive customer"
                      onClick={() => {
                        if (window.confirm(`Archive ${customer.name}? Existing projects will remain available.`)) {
                          void onArchive(customer.id);
                        }
                      }}
                    >
                      <Archive />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      {(creating || editing) && (
        <CustomerDialog
          busy={busy}
          customer={editing}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (input) => {
            if (editing) await onUpdate(editing.id, input);
            else await onCreate(input);
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

export function CustomerDialog({
  customer,
  busy,
  onCancel,
  onSubmit
}: {
  customer?: Customer | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateCustomerInput) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateCustomerInput>({
    customerType: customer?.customerType ?? "individual",
    name: customer?.name ?? "",
    companyName: customer?.companyName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
    postalCode: customer?.postalCode ?? "",
    country: customer?.country ?? "",
    notes: customer?.notes ?? ""
  });

  const update = (key: keyof CreateCustomerInput, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onCancel()}>
      <form
        className="new-project-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(form);
        }}
      >
        <h2>{customer ? "Edit Customer" : "New Customer"}</h2>
        <label className="field stacked">
          <span>Type</span>
          <select value={form.customerType} onChange={(event) => update("customerType", event.target.value)}>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </select>
        </label>
        <label className="field stacked">
          <span>Name *</span>
          <input autoFocus value={form.name} onChange={(event) => update("name", event.target.value)} />
        </label>
        <label className="field stacked">
          <span>Company</span>
          <input value={form.companyName ?? ""} onChange={(event) => update("companyName", event.target.value)} />
        </label>
        <div className="form-grid-two">
          <label className="field stacked">
            <span>Phone</span>
            <input value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} />
          </label>
          <label className="field stacked">
            <span>Email</span>
            <input type="email" value={form.email ?? ""} onChange={(event) => update("email", event.target.value)} />
          </label>
        </div>
        <label className="field stacked">
          <span>Customer address</span>
          <input value={form.address ?? ""} onChange={(event) => update("address", event.target.value)} />
        </label>
        <div className="form-grid-two">
          <label className="field stacked">
            <span>City</span>
            <input value={form.city ?? ""} onChange={(event) => update("city", event.target.value)} />
          </label>
          <label className="field stacked">
            <span>State</span>
            <input value={form.state ?? ""} onChange={(event) => update("state", event.target.value)} />
          </label>
        </div>
        <label className="field stacked">
          <span>Notes</span>
          <textarea value={form.notes ?? ""} onChange={(event) => update("notes", event.target.value)} />
        </label>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" disabled={busy || !form.name.trim()}>{busy ? "Saving..." : "Save Customer"}</button>
        </div>
      </form>
    </div>
  );
}
