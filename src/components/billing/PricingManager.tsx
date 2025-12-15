import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Tag, Zap, Trash2, Edit2 } from "lucide-react";

interface StripeProduct {
  id: string;
  stripe_product_id: string;
  stripe_price_id: string;
  name: string;
  description: string;
  pricing_type: string;
  unit_amount: number;
  currency: string;
  billing_interval: string;
  metered_usage_type: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export default function PricingManager() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StripeProduct | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unitAmount, setUnitAmount] = useState("");
  const [pricingType, setPricingType] = useState("recurring");
  const [billingInterval, setBillingInterval] = useState("month");
  const [meteredUsageType, setMeteredUsageType] = useState("sum");

  const { data: products, isLoading } = useQuery({
    queryKey: ['stripe-products'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('billing-agent', {
        body: { action: 'get_products' }
      });
      if (error) throw error;
      return data.products as StripeProduct[];
    }
  });

  const createProduct = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('billing-agent', {
        body: {
          action: 'create_stripe_product',
          name,
          description,
          unit_amount: Math.round(parseFloat(unitAmount) * 100), // Convert to cents
          pricing_type: pricingType,
          billing_interval: billingInterval,
          metered_usage_type: pricingType === 'metered' ? meteredUsageType : undefined,
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stripe-products'] });
      toast.success('Product created successfully');
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Failed to create product: ${error.message}`);
    }
  });

  const updatePricing = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) return;
      const { data, error } = await supabase.functions.invoke('billing-agent', {
        body: {
          action: 'update_pricing',
          product_id: selectedProduct.id,
          new_unit_amount: Math.round(parseFloat(unitAmount) * 100),
          reason: 'Price updated via admin panel',
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stripe-products'] });
      toast.success('Pricing updated successfully');
      setEditDialogOpen(false);
      setSelectedProduct(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update pricing: ${error.message}`);
    }
  });

  const deleteProduct = useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await supabase.functions.invoke('billing-agent', {
        body: {
          action: 'delete_product',
          product_id: productId,
          reason: 'Archived via admin panel',
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stripe-products'] });
      toast.success('Product archived');
    },
    onError: (error: Error) => {
      toast.error(`Failed to archive product: ${error.message}`);
    }
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setUnitAmount("");
    setPricingType("recurring");
    setBillingInterval("month");
    setMeteredUsageType("sum");
  };

  const openEditDialog = (product: StripeProduct) => {
    setSelectedProduct(product);
    setUnitAmount((product.unit_amount / 100).toString());
    setEditDialogOpen(true);
  };

  const getPricingTypeBadge = (type: string) => {
    switch (type) {
      case 'metered': return <Badge variant="default">Metered</Badge>;
      case 'recurring': return <Badge variant="secondary">Recurring</Badge>;
      case 'one_time': return <Badge variant="outline">One-time</Badge>;
      default: return <Badge variant="secondary">{type}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Products & Pricing
        </CardTitle>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Product</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Product Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Voice Minutes"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Per-minute voice agent usage"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Pricing Type</Label>
                  <Select value={pricingType} onValueChange={setPricingType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recurring">Recurring</SelectItem>
                      <SelectItem value="metered">Metered (Usage-based)</SelectItem>
                      <SelectItem value="one_time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Price (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={unitAmount}
                    onChange={(e) => setUnitAmount(e.target.value)}
                    placeholder="0.10"
                  />
                </div>
              </div>
              {pricingType !== 'one_time' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Billing Interval</Label>
                    <Select value={billingInterval} onValueChange={setBillingInterval}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">Monthly</SelectItem>
                        <SelectItem value="year">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {pricingType === 'metered' && (
                    <div>
                      <Label>Usage Aggregation</Label>
                      <Select value={meteredUsageType} onValueChange={setMeteredUsageType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sum">Sum</SelectItem>
                          <SelectItem value="max">Maximum</SelectItem>
                          <SelectItem value="last_during_period">Last</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createProduct.mutate()}
                disabled={!name || !unitAmount || createProduct.isPending}
              >
                {createProduct.isPending ? 'Creating...' : 'Create Product'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading products...</p>
          ) : products?.length === 0 ? (
            <p className="text-muted-foreground text-sm">No products configured. Create your first product to start billing.</p>
          ) : (
            products?.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-primary" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{product.name}</p>
                      {getPricingTypeBadge(product.pricing_type)}
                      {product.created_by === 'ai_agent' && (
                        <Badge variant="outline" className="text-xs">AI Created</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{product.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-medium">${(product.unit_amount / 100).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.pricing_type === 'metered' ? 'per unit' : 
                       product.billing_interval ? `per ${product.billing_interval}` : 'one-time'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(product)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteProduct.mutate(product.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>

      {/* Edit Pricing Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Pricing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Updating price for: <strong>{selectedProduct?.name}</strong>
            </p>
            <div>
              <Label>New Price (USD)</Label>
              <Input
                type="number"
                step="0.01"
                value={unitAmount}
                onChange={(e) => setUnitAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Current: ${selectedProduct ? (selectedProduct.unit_amount / 100).toFixed(2) : '0.00'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updatePricing.mutate()}
              disabled={!unitAmount || updatePricing.isPending}
            >
              {updatePricing.isPending ? 'Updating...' : 'Update Price'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
