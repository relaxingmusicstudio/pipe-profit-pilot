import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  FileQuestion, 
  Users, 
  Inbox, 
  FolderOpen, 
  CheckCircle2,
  Plus 
} from "lucide-react";

type EmptyStateVariant = "default" | "contacts" | "inbox" | "files" | "success";

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const variantIcons: Record<EmptyStateVariant, ReactNode> = {
  default: <FileQuestion className="h-12 w-12 text-muted-foreground/50" />,
  contacts: <Users className="h-12 w-12 text-blue-500/50" />,
  inbox: <Inbox className="h-12 w-12 text-purple-500/50" />,
  files: <FolderOpen className="h-12 w-12 text-amber-500/50" />,
  success: <CheckCircle2 className="h-12 w-12 text-green-500/60" />,
};

const variantBg: Record<EmptyStateVariant, string> = {
  default: "bg-muted/30",
  contacts: "bg-blue-500/5",
  inbox: "bg-purple-500/5",
  files: "bg-amber-500/5",
  success: "bg-green-500/5",
};

export function EmptyState({
  variant = "default",
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const Icon = icon || variantIcons[variant];
  
  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed",
        variantBg[variant],
        className
      )}
    >
      <div className="mb-4 p-4 rounded-full bg-background/60">
        {Icon}
      </div>
      
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          {description}
        </p>
      )}
      
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-2">
          {action && (
            <Button onClick={action.onClick} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button 
              onClick={secondaryAction.onClick} 
              variant="outline" 
              size="sm"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
