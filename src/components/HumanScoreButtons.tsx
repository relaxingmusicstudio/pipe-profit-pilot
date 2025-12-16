import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HumanScoreButtonsProps {
  entityType: string;
  entityId: string;
  initialRating?: 'good' | 'bad' | null;
  initialVaulted?: boolean;
  onRatingChange?: (rating: 'good' | 'bad' | null) => void;
  onVaultChange?: (vaulted: boolean) => void;
  className?: string;
  size?: "sm" | "default";
  showVault?: boolean;
}

export function HumanScoreButtons({
  entityType,
  entityId,
  initialRating = null,
  initialVaulted = false,
  onRatingChange,
  onVaultChange,
  className = "",
  size = "sm",
  showVault = true,
}: HumanScoreButtonsProps) {
  const [rating, setRating] = useState<'good' | 'bad' | null>(initialRating);
  const [vaulted, setVaulted] = useState(initialVaulted);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRating = async (newRating: 'good' | 'bad') => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    const finalRating = rating === newRating ? null : newRating;
    
    try {
      // Check if rating exists
      const { data: existing } = await supabase
        .from('human_ratings')
        .select('id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single();

      if (existing) {
        await supabase
          .from('human_ratings')
          .update({ rating: finalRating })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('human_ratings')
          .insert({
            entity_type: entityType,
            entity_id: entityId,
            rating: finalRating,
            saved_to_vault: vaulted,
          });
      }

      setRating(finalRating);
      onRatingChange?.(finalRating);
      
      if (finalRating === 'good') {
        toast.success("Marked as good! 👍");
      } else if (finalRating === 'bad') {
        toast.info("Marked as needs improvement");
      }
    } catch (error) {
      console.error('Rating error:', error);
      toast.error("Couldn't save rating");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVault = async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    const newVaulted = !vaulted;
    
    try {
      const { data: existing } = await supabase
        .from('human_ratings')
        .select('id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single();

      if (existing) {
        await supabase
          .from('human_ratings')
          .update({ saved_to_vault: newVaulted })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('human_ratings')
          .insert({
            entity_type: entityType,
            entity_id: entityId,
            saved_to_vault: newVaulted,
          });
      }

      setVaulted(newVaulted);
      onVaultChange?.(newVaulted);
      
      if (newVaulted) {
        toast.success("Saved to vault! ⭐");
      } else {
        toast.info("Removed from vault");
      }
    } catch (error) {
      console.error('Vault error:', error);
      toast.error("Couldn't update vault");
    } finally {
      setIsSubmitting(false);
    }
  };

  const buttonSize = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          buttonSize,
          "p-0 transition-all",
          rating === 'good' 
            ? "bg-green-500/20 text-green-600 hover:bg-green-500/30" 
            : "hover:bg-green-500/10 hover:text-green-600"
        )}
        onClick={() => handleRating('good')}
        disabled={isSubmitting}
        title="Mark as good"
      >
        {isSubmitting ? (
          <Loader2 className={cn(iconSize, "animate-spin")} />
        ) : (
          <ThumbsUp className={cn(iconSize, rating === 'good' && "fill-current")} />
        )}
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          buttonSize,
          "p-0 transition-all",
          rating === 'bad' 
            ? "bg-red-500/20 text-red-600 hover:bg-red-500/30" 
            : "hover:bg-red-500/10 hover:text-red-600"
        )}
        onClick={() => handleRating('bad')}
        disabled={isSubmitting}
        title="Mark as needs improvement"
      >
        {isSubmitting ? (
          <Loader2 className={cn(iconSize, "animate-spin")} />
        ) : (
          <ThumbsDown className={cn(iconSize, rating === 'bad' && "fill-current")} />
        )}
      </Button>

      {showVault && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            buttonSize,
            "p-0 transition-all ml-1",
            vaulted 
              ? "bg-amber-500/20 text-amber-600 hover:bg-amber-500/30" 
              : "hover:bg-amber-500/10 hover:text-amber-600"
          )}
          onClick={handleVault}
          disabled={isSubmitting}
          title={vaulted ? "Remove from vault" : "Save to vault"}
        >
          {isSubmitting ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : (
            <Star className={cn(iconSize, vaulted && "fill-current")} />
          )}
        </Button>
      )}
    </div>
  );
}

export default HumanScoreButtons;
