import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface FieldMapping {
  first_name: boolean;
  last_name: boolean;
  email: boolean;
  job_title: boolean;
  company_name: boolean;
  linkedin_url: boolean;
}

interface FieldMapperProps {
  mapping: FieldMapping;
  onChange: (mapping: FieldMapping) => void;
  isLoading?: boolean;
}

export function FieldMapper({ mapping, onChange, isLoading = false }: FieldMapperProps) {
  const fields = [
    { key: "first_name", label: "First Name", description: "Contact's first name" },
    { key: "last_name", label: "Last Name", description: "Contact's last name" },
    { key: "email", label: "Email Address", description: "Contact's email address" },
    { key: "job_title", label: "Job Title", description: "Contact's position/title" },
    { key: "company_name", label: "Company Name", description: "Contact's company" },
    { key: "linkedin_url", label: "LinkedIn URL", description: "Contact's LinkedIn profile" },
  ];

  const handleToggle = (fieldKey: string) => {
    onChange({
      ...mapping,
      [fieldKey]: !mapping[fieldKey as keyof FieldMapping],
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Field Mapping</CardTitle>
        <CardDescription>
          Select which HubCredo lead fields to sync to your Attio CRM
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {fields.map(({ key, label, description }) => (
            <div
              key={key}
              className="flex items-center justify-between p-4 border border-[#E2E8F0] rounded-lg hover:bg-[#F5F7FA] transition-colors"
            >
              <div className="flex-1">
                <label className="text-sm font-medium text-[#0A0A0A] cursor-pointer block">
                  {label}
                </label>
                <p className="text-xs text-[#64748B] mt-1">{description}</p>
              </div>
              <input
                type="checkbox"
                checked={mapping[key as keyof FieldMapping] || false}
                onChange={() => handleToggle(key)}
                disabled={isLoading}
                className="w-5 h-5 cursor-pointer accent-[#4f46e5]"
              />
            </div>
          ))}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Email is required for CRM synchronization. At least one contact
              field must be enabled.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}