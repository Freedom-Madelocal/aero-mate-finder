import DashboardLayout from "@/components/DashboardLayout";
import StatusTooltip from "@/components/StatusTooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Thermometer,
  Zap,
  Filter,
  Save,
  Trash2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useMaterialStore } from "@/data/materials";
import { useMasterSpecStore, getInventoryMatch, type MasterSpec } from "@/data/masterSpecs";
import { Link } from "@tanstack/react-router";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Engineer page: Reverse-lookup tool for OEM/MRO/Space engineers.
 * Specify requirements → find matching materials → save kits for reuse.
 */

interface SpecFilter {
  minServiceTemp?: number;
  maxServiceTemp?: number;
  form?: string;
  chemistry?: string;
  nasaE595?: string;
  ooaCapable?: string;
  applications?: string[];
}

interface MaterialKit {
  id: string;
  name: string;
  description: string;
  specs: SpecFilter;
  savedAt: string;
  matchCount: number;
}

const FORMS = ["Film", "Paste", "Foam", "Surface Film", "Primer", "Bonding Film"];
const CHEMISTRIES = [
  "Epoxy",
  "BMI",
  "Polyimide",
  "Cyanate Ester",
  "Phenolic",
  "Covalent",
  "Sol-Gel",
];
const APPLICATIONS = [
  "Satellite Structure",
  "Launch Vehicle",
  "Honeycomb Sandwich",
  "Heat Shield / TPS",
  "Metal Bonding",
  "Composite Bonding",
  "Radome / RF",
  "Repair / MRO",
];

export default function Engineer() {
  const { specs: masterSpecs } = useMasterSpecStore();
  const { materials } = useMaterialStore();
  const isEmpty = masterSpecs.length === 0;

  // Filter state
  const [specs, setSpecs] = useState<SpecFilter>({});
  const [selectedApplications, setSelectedApplications] = useState<string[]>([]);
  const [kits, setKits] = useState<MaterialKit[]>([]);
  const [kitName, setKitName] = useState("");
  const [kitDescription, setKitDescription] = useState("");

  // Match against master spec catalog
  const matchedSpecs = useMemo(() => {
    return masterSpecs.filter((s: MasterSpec) => {
      const t = s.maxServiceTemperatureC;
      if (specs.minServiceTemp && (t === null || t < specs.minServiceTemp)) return false;
      if (specs.maxServiceTemp && (t === null || t > specs.maxServiceTemp)) return false;
      if (specs.form && (s.productForm ?? "").toLowerCase() !== specs.form.toLowerCase()) return false;
      if (specs.chemistry && (s.resinChemistry ?? "").toLowerCase() !== specs.chemistry.toLowerCase()) return false;
      if (specs.ooaCapable === "required" && !s.ooaVboCapable) return false;
      if (specs.nasaE595 === "required" && (s.tmlPct === null || s.tmlPct > 1.0 || s.cvcmPct === null || s.cvcmPct > 0.1)) return false;
      if (selectedApplications.length > 0) {
        const apps = (s.applications ?? "").toLowerCase();
        if (!selectedApplications.every((a) => apps.includes(a.toLowerCase()))) return false;
      }
      return true;
    });
  }, [masterSpecs, specs, selectedApplications]);

  const handleSaveKit = () => {
    if (!kitName.trim()) return;

    const newKit: MaterialKit = {
      id: `kit-${Date.now()}`,
      name: kitName,
      description: kitDescription,
      specs,
      savedAt: new Date().toISOString(),
      matchCount: matchedMaterials.length,
    };

    setKits([...kits, newKit]);
    setKitName("");
    setKitDescription("");
  };

  const handleLoadKit = (kit: MaterialKit) => {
    setSpecs(kit.specs);
    setSelectedApplications(kit.specs.applications || []);
  };

  const handleDeleteKit = (kitId: string) => {
    setKits(kits.filter((k) => k.id !== kitId));
  };

  const handleClearFilters = () => {
    setSpecs({});
    setSelectedApplications([]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Material Specification Lookup
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEmpty
              ? "Upload material data to begin cross-referencing specifications"
              : `Search ${materials.length} materials by technical requirements`}
          </p>
        </div>

        {isEmpty ? (
          <div className="bg-card border border-border rounded-lg p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">
              No Materials Available
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Upload a stock report in Inventory to populate the material database.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="search" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="kits">Saved Kits ({kits.length})</TabsTrigger>
            </TabsList>

            {/* Search Tab */}
            <TabsContent value="search" className="space-y-6">
              {/* Filter Panel */}
              <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Specification Filters
                  </h2>
                  {(Object.keys(specs).length > 0 ||
                    selectedApplications.length > 0) && (
                    <button
                      onClick={handleClearFilters}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Service Temperature Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">
                      <StatusTooltip content="Minimum service temperature in °C. Materials must support this temperature.">
                        <span className="flex items-center gap-1 cursor-help">
                          <Thermometer className="w-3 h-3" />
                          Min Service Temp
                        </span>
                      </StatusTooltip>
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g., 100"
                      value={specs.minServiceTemp || ""}
                      onChange={(e) =>
                        setSpecs({
                          ...specs,
                          minServiceTemp: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className="bg-secondary border-border"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">
                      Max Service Temp
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g., 300"
                      value={specs.maxServiceTemp || ""}
                      onChange={(e) =>
                        setSpecs({
                          ...specs,
                          maxServiceTemp: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className="bg-secondary border-border"
                    />
                  </div>
                </div>

                {/* Form */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">
                    Form
                  </label>
                  <Select
                    value={specs.form || "any-form"}
                    onValueChange={(value) =>
                      setSpecs({
                        ...specs,
                        form: value === "any-form" ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Any form" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any-form">Any form</SelectItem>
                      {FORMS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Chemistry */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">
                    Chemistry
                  </label>
                  <Select
                    value={specs.chemistry || "any-chemistry"}
                    onValueChange={(value) =>
                      setSpecs({
                        ...specs,
                        chemistry: value === "any-chemistry" ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Any chemistry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any-chemistry">Any chemistry</SelectItem>
                      {CHEMISTRIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* NASA E595 */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">
                    <StatusTooltip content={STATUS_TOOLTIPS["nasa-pass"]}>
                      <span className="flex items-center gap-1 cursor-help">
                        <Zap className="w-3 h-3" />
                        NASA E595 Compliance
                      </span>
                    </StatusTooltip>
                  </label>
                  <Select
                    value={specs.nasaE595 || "any-nasa"}
                    onValueChange={(value) =>
                      setSpecs({
                        ...specs,
                        nasaE595: value === "any-nasa" ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any-nasa">Any</SelectItem>
                      <SelectItem value="required">Required (Pass)</SelectItem>
                      <SelectItem value="preferred">
                        Preferred (Verify)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* OOA Capable */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">
                    <StatusTooltip content="Out-of-Autoclave capable. Material can be cured without autoclave pressure.">
                      <span className="flex items-center gap-1 cursor-help">
                        OOA Capable
                      </span>
                    </StatusTooltip>
                  </label>
                  <Select
                    value={specs.ooaCapable || "any-ooa"}
                    onValueChange={(value) =>
                      setSpecs({
                        ...specs,
                        ooaCapable: value === "any-ooa" ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any-ooa">Any</SelectItem>
                      <SelectItem value="required">Required</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Applications */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">
                    Applications (select all that apply)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {APPLICATIONS.map((app) => (
                      <button
                        key={app}
                        onClick={() => {
                          setSelectedApplications((prev) =>
                            prev.includes(app)
                              ? prev.filter((a) => a !== app)
                              : [...prev, app]
                          );
                        }}
                        className={`text-xs px-3 py-2 rounded border transition-all ${
                          selectedApplications.includes(app)
                            ? "bg-foreground text-background border-foreground"
                            : "bg-secondary border-border text-muted-foreground hover:border-foreground/40"
                        }`}
                      >
                        {app}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save Kit Button */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={
                        Object.keys(specs).length === 0 &&
                        selectedApplications.length === 0
                      }
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save as Kit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Save Material Kit</DialogTitle>
                      <DialogDescription>
                        Save your current search filters for quick reuse.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          Kit Name
                        </label>
                        <Input
                          placeholder="e.g., Primary Structure Epoxy"
                          value={kitName}
                          onChange={(e) => setKitName(e.target.value)}
                          className="bg-secondary border-border"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          Description (optional)
                        </label>
                        <Input
                          placeholder="e.g., High-temp epoxy for fuselage bonding"
                          value={kitDescription}
                          onChange={(e) => setKitDescription(e.target.value)}
                          className="bg-secondary border-border"
                        />
                      </div>
                      <Button
                        onClick={handleSaveKit}
                        disabled={!kitName.trim()}
                        className="w-full"
                      >
                        Save Kit
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Results */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground">
                    Matching Materials ({matchedMaterials.length})
                  </h2>
                  {matchedMaterials.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {matchedMaterials.reduce(
                        (sum, m: Material) => sum + m.availableQty,
                        0
                      )}{" "}
                      units available
                    </span>
                  )}
                </div>

                {matchedMaterials.length === 0 ? (
                  <div className="bg-card border border-border rounded-lg p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No materials match your specifications.
                    </p>
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-secondary/30">
                            <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">
                              Product
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                              Supplier
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                              Form / Chemistry
                            </th>
                            <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">
                              Service Temp
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">
                              Available
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">
                              Incoming
                            </th>
                            <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">
                              NASA E595
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchedMaterials.map((material: Material) => (
                            <tr
                              key={material.id}
                              className="border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-pointer"
                              onClick={() => {
                                // Could navigate to material detail here
                              }}
                            >
                              <td className="px-5 py-3">
                                <div>
                                  <div className="font-medium text-foreground">
                                    {material.product}
                                  </div>
                                  {material.formerName && (
                                    <div className="text-xs text-muted-foreground">
                                      {material.formerName}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {material.supplier}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {material.form} / {material.chemistry}
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-foreground">
                                {material.maxServiceTemp}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <StatusTooltip content="Units currently in stock">
                                  <span className="font-mono text-foreground">
                                    {material.availableQty} {material.availableUnit}
                                  </span>
                                </StatusTooltip>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {material.incomingQty > 0 ? (
                                  <StatusTooltip
                                    content={`Arriving ${material.incomingEta}`}
                                  >
                                    <span className="font-mono text-[var(--status-warning)]">
                                      +{material.incomingQty}
                                    </span>
                                  </StatusTooltip>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <StatusTooltip
                                  content={
                                    material.nasaE595 === "—"
                                      ? "Not NASA E595 compliant"
                                      : material.nasaE595 === "▲"
                                        ? "NASA E595 Pass"
                                        : "NASA E595 Verify"
                                  }
                                >
                                  <span
                                    className={`text-sm font-mono ${
                                      material.nasaE595 === "—"
                                        ? "text-muted-foreground/40"
                                        : material.nasaE595 === "▲"
                                          ? "text-[var(--status-compliant)]"
                                          : "text-[var(--status-warning)]"
                                    }`}
                                  >
                                    {material.nasaE595}
                                  </span>
                                </StatusTooltip>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Saved Kits Tab */}
            <TabsContent value="kits" className="space-y-4">
              {kits.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-12 text-center">
                  <Info className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No saved kits yet. Create a search and save it as a kit for quick reuse.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {kits.map((kit) => (
                    <div
                      key={kit.id}
                      className="bg-card border border-border rounded-lg p-4 hover:border-foreground/20 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground">
                            {kit.name}
                          </h3>
                          {kit.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {kit.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteKit(kit.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                        <span>
                          {kit.matchCount} materials match • Saved{" "}
                          {new Date(kit.savedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLoadKit(kit)}
                        className="w-full"
                      >
                        Load Kit
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
