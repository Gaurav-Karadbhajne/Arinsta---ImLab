// One payment/refund receipt as a real PDF (QuestPDF), downloaded directly by the browser.
using ImLab.Models.Services;
using ImLab.Models.ViewModels;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace ImLab.Web.Reports;

public static class PaymentReceiptPdf
{
    public static byte[] Build(PaymentReceiptVm r) =>
        Document.Create(doc => doc.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(40);
            page.DefaultTextStyle(x => x.FontSize(11).FontColor("#0F2A3D"));
            var isRefund = r.Kind == "refund";

            page.Header().Column(col =>
            {
                col.Item().AlignCenter().Text(r.CompanyName).Bold().FontSize(18);
                col.Item().AlignCenter().Text(isRefund ? "Refund voucher" : "Payment receipt").FontSize(10).FontColor("#5B7384");
            });

            page.Content().Column(col =>
            {
                col.Spacing(6);
                col.Item().PaddingVertical(8).LineHorizontal(1).LineColor("#B9C6CE");
                col.Item().Row(row =>
                {
                    row.RelativeItem().Text(t => { t.Span("Receipt no: ").FontColor("#5B7384"); t.Span(r.ReceiptNo); });
                    row.RelativeItem().AlignRight().Text(t => { t.Span("Date: ").FontColor("#5B7384"); t.Span(IndianTime.FromUtc(r.PaidAt).ToString("dd/MM/yyyy, hh:mm tt") + " IST"); });
                });
                col.Item().Row(row =>
                {
                    row.RelativeItem().Text(t => { t.Span("Patient: ").FontColor("#5B7384"); t.Span(r.PatientName); });
                    row.RelativeItem().AlignRight().Text(t => { t.Span("ID: ").FontColor("#5B7384"); t.Span(r.Uid); });
                });
                col.Item().Row(row =>
                {
                    row.RelativeItem().Text(t => { t.Span("Bill: ").FontColor("#5B7384"); t.Span(r.BillNo); });
                    row.RelativeItem().AlignRight().Text(t => { t.Span("Lab no: ").FontColor("#5B7384"); t.Span(r.LabNo.ToString()); });
                });

                col.Item().PaddingVertical(12).AlignCenter().Text(t =>
                {
                    t.Span(isRefund ? "Amount refunded   " : "Amount received   ").FontColor("#5B7384");
                    t.Span(r.Amount.ToString("N2")).Bold().FontSize(22).FontColor(isRefund ? "#C0392B" : "#0B7A6D");
                });

                col.Item().Text(t => { t.Span("Mode: ").FontColor("#5B7384"); t.Span(r.Mode); });
                if (!string.IsNullOrWhiteSpace(r.Reason)) col.Item().Text(t => { t.Span("Reason: ").FontColor("#5B7384"); t.Span(r.Reason); });
                if (!string.IsNullOrWhiteSpace(r.Remark)) col.Item().Text(t => { t.Span("Remark: ").FontColor("#5B7384"); t.Span(r.Remark); });

                col.Item().PaddingVertical(8).LineHorizontal(1).LineColor("#B9C6CE");
                col.Item().AlignRight().Column(tot =>
                {
                    tot.Spacing(2);
                    tot.Item().Row(x => { x.AutoItem().Text("Bill total"); x.ConstantItem(110).AlignRight().Text(r.Total.ToString("N2")); });
                    tot.Item().Row(x => { x.AutoItem().Text("Discount"); x.ConstantItem(110).AlignRight().Text("- " + r.Discount.ToString("N2")); });
                    tot.Item().Row(x => { x.AutoItem().Text("Collected so far"); x.ConstantItem(110).AlignRight().Text(r.Paid.ToString("N2")); });
                    tot.Item().Row(x => { x.AutoItem().Text("Refunded so far"); x.ConstantItem(110).AlignRight().Text(r.Refunded.ToString("N2")); });
                    tot.Item().PaddingTop(4).BorderTop(1).BorderColor("#0F2A3D").Row(x =>
                    {
                        x.AutoItem().Text("Balance").Bold();
                        x.ConstantItem(110).AlignRight().Text(r.Balance.ToString("N2")).Bold().FontColor(r.Balance > 0 ? "#C0392B" : "#0B7A6D");
                    });
                });

                col.Item().PaddingTop(28).AlignCenter().Text("Thank you!").FontSize(10).FontColor("#5B7384");
            });
        })).GeneratePdf();
}