import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, Loader2, Copy, CheckCircle, XCircle } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type MFAStatus = "loading" | "unenrolled" | "enrolling" | "enrolled" | "verifying";

const TwoFactorSection = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useState<MFAStatus>("loading");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkMFAStatus();
  }, []);

  const checkMFAStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const verifiedFactors = data.totp.filter(f => f.status === "verified");
      if (verifiedFactors.length > 0) {
        setStatus("enrolled");
        setFactorId(verifiedFactors[0].id);
      } else {
        setStatus("unenrolled");
      }
    } catch (err: any) {
      console.error("Error checking MFA status:", err);
      setStatus("unenrolled");
    }
  };

  const startEnrollment = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator App",
      });

      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStatus("enrolling");
    } catch (err: any) {
      setError(err.message);
      toast({
        title: t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEnrollment = async () => {
    if (!factorId || verifyCode.length !== 6) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });

      if (verifyError) throw verifyError;

      setStatus("enrolled");
      setQrCode(null);
      setSecret(null);
      setVerifyCode("");

      // Log activity
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("activity_log").insert({
          user_id: user.id,
          action_type: "2fa_enabled",
          description: "Two-factor authentication enabled",
        });
      }

      toast({
        title: t("twoFactor.enableSuccessTitle"),
        description: t("twoFactor.enableSuccess"),
      });
    } catch (err: any) {
      setError(err.message);
      toast({
        title: t("twoFactor.verificationFailed"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const unenroll = async () => {
    if (!factorId) return;

    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;

      // Log activity
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("activity_log").insert({
          user_id: user.id,
          action_type: "2fa_disabled",
          description: "Two-factor authentication disabled",
        });
      }

      setStatus("unenrolled");
      setFactorId(null);
      toast({
        title: t("twoFactor.disableSuccessTitle"),
        description: t("twoFactor.disableSuccess"),
      });
    } catch (err: any) {
      setError(err.message);
      toast({
        title: t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const cancelEnrollment = () => {
    setStatus("unenrolled");
    setQrCode(null);
    setSecret(null);
    setVerifyCode("");
    setError(null);
  };

  if (status === "loading") {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("twoFactor.title")}
          </div>
          {status === "enrolled" && (
            <Badge variant="default" className="bg-green-600">
              <ShieldCheck className="h-3 w-3 mr-1" />
              {t("twoFactor.enabled")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t("twoFactor.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {status === "unenrolled" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("twoFactor.protectAccount")}
            </p>
            <Button onClick={startEnrollment} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("twoFactor.settingUp")}
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  {t("twoFactor.enable")}
                </>
              )}
            </Button>
          </div>
        )}

        {status === "enrolling" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium mb-2">{t("twoFactor.step1Title")}</p>
                <p className="text-muted-foreground">
                  {t("twoFactor.step1Desc")}
                </p>
              </div>
              
              {qrCode && (
                <div className="flex justify-center p-4 bg-white rounded-lg w-fit mx-auto">
                  <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                </div>
              )}

              {secret && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("twoFactor.manualEntry")}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all">
                      {secret}
                    </code>
                    <Button variant="outline" size="icon" onClick={copySecret}>
                      {copied ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium mb-2">{t("twoFactor.step2Title")}</p>
                <p className="text-muted-foreground">
                  {t("twoFactor.step2Desc")}
                </p>
              </div>
              
              <div className="flex justify-center">
                <InputOTP
                  value={verifyCode}
                  onChange={setVerifyCode}
                  maxLength={6}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={cancelEnrollment}
                disabled={isLoading}
              >
                {t("twoFactor.cancel")}
              </Button>
              <Button 
                onClick={verifyEnrollment}
                disabled={isLoading || verifyCode.length !== 6}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("twoFactor.verifying")}
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {t("twoFactor.verifyEnable")}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {status === "enrolled" && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>
                {t("twoFactor.enabledDesc")}
              </AlertDescription>
            </Alert>
            <Button 
              variant="destructive" 
              onClick={unenroll}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("twoFactor.disabling")}
                </>
              ) : (
                t("twoFactor.disable")
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TwoFactorSection;
