# Kịch bản demo — 30–45 phút

> **Tài liệu demo/legacy** — xem [“Giới thiệu hệ thống cho lãnh đạo”](gioi-thieu-he-thong-cho-lanh-dao.md) để biết luồng hiện tại.
>
> Kịch bản này đo ngày 06/09/2026 theo cách làm dựa trên **chuyến** (Lập chuyến → Phân công →
> Bắt đầu chuyến → Đã giao). Luồng hiện hành đi từ **Đơn hàng** (chọn điểm trên bản đồ) → **Vòng
> xe** → **Chặng** → mốc hiện trường → **Kết thúc đơn**; số liệu kỳ vọng bên dưới không còn khớp.
>
> **Không chạy lệnh làm lại dữ liệu** (`reset-transport-demo.mjs`) trên bản demo hiện tại: lệnh
> này không xoá được dữ liệu đơn hàng và vòng xe nên dừng giữa chừng, và bản demo hiện tại không
> chạy trên máy ảo mô tả ở đây.

Kịch bản **tất định**: mọi con số dưới đây là số thật của bản demo sau khi làm lại dữ liệu, đo trên
bản đang chạy ngày 06/09/2026. Nếu màn hình ra số khác, hoặc là chưa làm lại dữ liệu, hoặc là có
người vừa thao tác trên đó.

Kịch bản gài sẵn **câu hỏi cho khách** ở đúng chỗ. Chúng không phải phần phụ — mỗi câu là một chỗ
hệ thống đang chờ khách quyết, và hỏi lúc đang xem màn hình liên quan cho câu trả lời tốt hơn hẳn
hỏi rời trong một cuộc họp khác.

---

## Trước buổi demo — 10 phút

```bash
cd /srv/netviet/apps/zalo-transport-preview-gd1-test
source ./stack-compose.sh && netviet_load_stack_composition
COMPOSE=(sudo docker compose --env-file .runtime/secrets.env "${NETVIET_COMPOSE_FILES[@]}")

sudo ./backup.sh                                    # 1. sao lưu

"${COMPOSE[@]}" --profile tools run --rm --no-deps \
  -e TENANT_DIR=/srv/tenant \
  -e TRANSPORT_DEMO_RESET=xoa-va-gieo-lai \
  bootstrap node deploy/netviet/reset-transport-demo.mjs   # 2. làm lại dữ liệu
```

Dòng kết quả **phải có** `staffLogins=1 driverLogins=12`. Không có thì màn hình lái xe và kế toán
sẽ không ai đăng nhập được — xem [`van-hanh-ban-demo.md`](van-hanh-ban-demo.md) §3.

**Chuẩn bị sẵn:**

- Máy tính mở trình duyệt, đã đăng nhập vai **Giám đốc**
- Điện thoại (hoặc một cửa sổ trình duyệt hẹp ~390px) mở màn hình **lái xe**, đăng nhập `lx.binh`
- Một cửa sổ ẩn danh để đăng nhập vai **Kế toán** khi cần
- Một tệp bảng kê cây xăng mẫu để nhập trực tiếp

### Trạng thái đầu — đối chiếu trước khi bắt đầu

| Chỗ                                                        | Giá trị                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Tổng quan — chuyến đang chạy / kế hoạch / chờ đối soát     | **1 / 1 / 1**                                                                            |
| Tổng quan — xe rỗi / lái xe đang làm / kỳ đối soát đang mở | **10 / 12 / 3**                                                                          |
| Tổng quan — việc chờ xử lý                                 | **2 việc**: `CH-25091` chưa cho chạy, `CH-25089` chờ chốt đối soát                       |
| Chuyến xe                                                  | **44 chuyến** (34 xe nhà · 5 thuê ngoài · 5 nhận chạy hộ)                                |
| Công nợ phải thu                                           | tổng **258.100.000 ₫**, quá hạn **37.300.000 ₫**, **39 chứng từ**                        |
| Biên trực tiếp                                             | doanh thu **262.300.000 ₫**, biên **202.676.201 ₫**, tỷ suất **77,27 %** trên 40 chuyến  |
| Bảo dưỡng & giấy tờ                                        | **34 cảnh báo**, trong đó **2 cần xử lý ngay**; **2 lệnh sửa đang mở**                   |
| Lương                                                      | _Kỳ lương tháng vận hành mẫu_ 07/08–05/09, **12 phiếu**, tổng thực nhận **86.806.000 ₫** |
| Quỹ của Nguyễn Văn Bình                                    | **4.159.120 ₫** — lái xe đang giữ tiền của công ty                                       |

---

## Phần 1 — Sáng nay công ty có việc gì (5 phút)

**Màn hình:** Tổng quan · **Vai:** Giám đốc

Mở thẳng vào Tổng quan. Không giải thích kiến trúc, không nói về hệ thống — chỉ đọc màn hình như
một người quản lý đọc buổi sáng:

> _"Sáng nay có 1 chuyến đang chạy, 1 chuyến chờ cho chạy, và 1 chuyến đã giao chờ chốt. Hai việc
> này đang chờ người xử lý, và bấm vào là sang thẳng chuyến đó."_

Bấm **`Chuyến CH-25091 chưa cho chạy`** → sang thẳng chuyến. Quay lại.

Chỉ vào ô **Xe đang bảo dưỡng = 0** và nói trước, đừng để khách tự phát hiện:

> _"Ô này đọc từ trạng thái ghi trên hồ sơ xe. Bên màn hình Bảo dưỡng đang có 2 lệnh sửa mở — hai
> con số nhìn từ hai nguồn, và chú thích ngay dưới ô nói rõ điều đó. Chúng tôi sẽ gộp về một nguồn."_

> **Hỏi khách:** _"Sáng anh mở máy, anh muốn thấy ngay ba con số nào?"_

---

## Phần 2 — Một chuyến hàng, từ lúc nhận đến lúc chốt (8 phút)

**Màn hình:** Chuyến xe · **Vai:** Giám đốc

Mở **Chuyến xe**. Chỉ vào bộ lọc **Loại chuyến** và giải thích ba loại bằng tiền, không bằng thuật
ngữ:

> _"Xe nhà tự chạy — mình bỏ dầu, bỏ tài, ăn trọn biên. Thuê xe ngoài — mình ăn phần chênh, và
> phát sinh nợ phải trả nhà xe. Nhận chạy hộ — xe mình chạy, nhưng có hoa hồng phải trả cho người
> giới thiệu đơn."_

**Lập một chuyến mới ngay trên màn hình:**

1. **Lập chuyến** → mã `DEMO-01`, hôm nay, Hà Nội → Hải Phòng, khách _Công ty CP Thép Đông Á_,
   giá cước `6.500.000`, quãng đường `120`
2. **Phân công** xe và lái xe **Nguyễn Văn Bình**
3. Chuyển **Đang chạy**

Dừng lại ở đây — chuyến này sẽ được lái xe cầm tiếp ở Phần 3.

Mở một chuyến **Thuê xe ngoài** bất kỳ, chỉ ra rằng nó **không có** mục quỹ lái xe và nhiên liệu:

> _"Chuyến thuê ngoài không có vận hành nội bộ. Nếu ai đó cố khai phiếu dầu cho chuyến này, hệ
> thống từ chối — không phải ẩn nút, mà từ chối ở máy chủ."_

> **Hỏi khách:** _"Tỷ lệ thuê ngoài của anh bao nhiêu phần trăm? Giá thuê nhà xe anh chốt theo
> tuyến hay theo từng chuyến?"_

---

## Phần 3 — Lái xe, trên điện thoại (7 phút)

**Màn hình:** điện thoại · **Vai:** Lái xe `lx.binh`

Đưa điện thoại cho khách cầm. Đây là phần thuyết phục nhất, nên để họ tự bấm.

1. **Trang chủ** — chuyến `DEMO-01` vừa lập đã ở đó. Bấm **Bắt đầu chuyến**.
2. **Nhiên liệu** — khai một phiếu: cây xăng, `62,5` lít, `1.437.500 ₫`, số km. **Gửi phiếu**.
3. **Đính ảnh chứng từ** — chụp bất cứ thứ gì. Ảnh gắn vào đúng phiếu.
4. **Chi phí** — ghi `450.000 ₫` phí cầu đường. Chỉ vào dòng chữ trên biểu mẫu:
   _"Khoản chi này trừ vào quỹ tạm ứng của chính bạn."_
5. **Quỹ** — số dư vừa giảm đúng 450.000 ₫.

Rồi nói câu quan trọng nhất của phần này:

> _"Anh thử tìm giá cước trên màn hình này xem. Không có. Và không phải chúng tôi ẩn đi — dữ liệu
> gửi xuống điện thoại không chứa trường giá cước, nên mở công cụ lập trình của trình duyệt ra
> cũng không thấy. Lái xe của anh mở chuyến của lái xe khác thì hệ thống trả về đúng cái mà nó trả
> về cho một chuyến không tồn tại — nên không dò được."_

> **Hỏi khách:** _"Lái xe của anh dùng điện thoại gì? Có ai không quen dùng app không? Có ai cần
> biết giá cước không — ví dụ khi tự thu tiền của khách?"_

---

## Phần 4 — Đối soát cây xăng (8 phút)

**Màn hình:** Nhiên liệu · **Vai:** Kế toán

Đây là phần khách quan tâm nhất nếu họ từng bị lệch tiền dầu.

1. **Xác thực** phiếu lái xe vừa khai ở Phần 3.
2. Chọn cây xăng, khoảng ngày, chọn tệp bảng kê → **Xem trước**.
   > _"Xem trước không ghi gì. Nó chỉ nói cho anh biết tệp này đọc được mấy dòng, dòng nào hỏng."_
3. **Nhập bảng kê** → **so khớp**.
4. Đọc kết quả theo ba nhóm — và dừng lâu ở nhóm **mập mờ**:
   > _"Dòng này khớp được với hai phiếu. Hệ thống **không đoán** — nó bắt anh chỉ rõ phiếu nào.
   > Đoán sai ở đây là ghi sai tiền cho một cây xăng có thật."_
5. Xử lý hết chênh lệch → **chốt kỳ**.
6. Thử **chốt khi còn chênh lệch chưa xử lý** → hệ thống chặn.

Rồi nói một điều mà phần lớn phần mềm không nói:

> _"Lệch nhiên liệu **không bao giờ** tự sinh nợ cho lái xe, và không bao giờ tự trừ lương. Một
> người phải quyết định điều đó."_

> **Hỏi khách:** _"Bảng kê cây xăng của anh là Excel hay CSV? Lệch bao nhiêu thì anh vẫn coi là
> khớp? Khi lái xe khai lệch, anh muốn xử lý thế nào — nhắc, trừ quỹ, hay trừ lương? Ai được quyết?"_

---

## Phần 5 — Tiền (7 phút)

**Màn hình:** Công nợ & quyết toán → AR/AP → Biên trực tiếp · **Vai:** Kế toán

**Công nợ phải thu** — chọn ngày hôm nay:

> _"Tổng còn nợ **258.100.000**, trong đó **37.300.000** đã quá hạn — 32,8 triệu quá hạn dưới 30
> ngày, 4,5 triệu quá hạn 31–60 ngày. Bên dưới là từng chứng từ, kèm hạn thanh toán."_

**AR/AP** — chỉ vào bốn dòng tiền phải trả tách riêng:

> _"Nhà xe 28.550.000, hoa hồng nguồn đơn 2.208.000. Bốn dòng này không cộng chung, vì một đối tác
> có thể vừa là nhà xe vừa là người giới thiệu đơn — khoá phân biệt là vai, không phải tên."_

**Biên trực tiếp**:

> _"Trên 40 chuyến đã đối soát: doanh thu **262.300.000**, biên trực tiếp **202.676.201**, tỷ suất
> **77,27 %**."_

Rồi đọc to nhãn dưới con số, đừng để nó thành chữ nhỏ:

> _"**Chưa gồm chi phí cố định.** Khấu hao xe, lương văn phòng, lãi vay không nằm trong đây. Con số
> này trả lời 'chuyến này có đáng chạy không', chứ không trả lời 'công ty lãi bao nhiêu'."_

> **Hỏi khách:** _"Anh muốn dừng ở biên trực tiếp, hay muốn phân bổ cả khấu hao và chi phí văn
> phòng vào từng chuyến? Nếu phân bổ thì theo km, theo chuyến, hay theo doanh thu?"_

---

## Phần 6 — Giấy tờ, bảo dưỡng, lương (7 phút)

**Màn hình:** Bảo dưỡng & giấy tờ → Lương · **Vai:** Giám đốc

**Bảo dưỡng & giấy tờ** — **34 cảnh báo, 2 cần xử lý ngay**:

> _"Xe 29C-334.71 hết hạn bảo hiểm 14 ngày rồi. Xe 15C-556.33 hết phù hiệu 6 ngày. Và đây —"_ (chỉ
> vào nhóm _Thiếu giấy tờ bắt buộc_) _"— những xe **chưa có** giấy tờ nào được nhập. Hệ thống không
> im lặng về chỗ nó không biết."_

> **Hỏi khách:** _"Anh muốn cảnh báo giấy tờ trước 15 hay 30 ngày? Đăng kiểm có cần báo sớm hơn
> bảo hiểm không?"_

**Lương** — mở _Kỳ lương tháng vận hành mẫu_ (07/08 – 05/09):

> _"12 phiếu, tổng thực nhận **86.806.000**. Mỗi phiếu tách rõ lương cơ bản, khoán theo chuyến,
> khoán theo ki-lô-mét, thưởng."_

Mở một phiếu, chỉ vào các khoản cấu thành. Rồi:

> _"Sửa một phiếu đã chốt thì hệ thống **phát một phiếu bù hoặc phiếu đảo**, giữ nguyên phiếu gốc.
> Không có sửa đè. Sáu tháng sau anh vẫn đọc lại được ai đã sửa gì, lúc nào, vì sao."_

Chuyển sang điện thoại của lái xe → **Phiếu lương**: chỉ hiện phiếu **đã công bố**.

> **Hỏi khách:** _"Cơ cấu lương thật của anh gồm những khoản nào? Có thưởng tiết kiệm dầu không?"_

---

## Phần 7 — Lấy số liệu ra (4 phút)

**Màn hình:** Xuất dữ liệu · **Vai:** Kế toán

Bấm **Chuyến xe (44)** → tệp tải về. Mở bằng Excel ngay trước mặt khách.

> _"Đúng cột, đúng dấu tiếng Việt, số để thô nên cộng và lọc được ngay. Kế toán của anh không phải
> gọi cho ai để lấy số liệu."_

Xuất thêm **Sổ quỹ lái xe** của Nguyễn Văn Bình → đối chiếu số dư **4.159.120 ₫** với màn hình.

> **Hỏi khách:** _"Kế toán của anh đang làm việc trên Excel hay phần mềm nào? Có cần đẩy thẳng số
> sang đó không?"_

---

## Phần 8 — Kết (3 phút)

Ba câu, không hơn:

> _"Thứ nhất: mọi con số anh vừa xem đều chạy thật trên máy chủ, không phải bản trình chiếu._
>
> _Thứ hai: dữ liệu trong này là dữ liệu **chúng tôi nghĩ ra**. Bước tiếp theo là thay bằng đội xe,
> lái xe và khách hàng thật của anh — có danh sách kiểm từng bước._
>
> _Thứ ba: có khoảng mười hai chỗ hệ thống đang **chờ anh quyết** — ngưỡng cảnh báo, cách tính hoa
> hồng, cơ cấu lương, ai được huỷ chuyến. Hôm nay anh trả lời được câu nào thì chúng tôi cấu hình
> đúng câu đó."_

Đưa [`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md) §3 — bảng 12 giả định.

---

## Nếu có sự cố giữa buổi

| Triệu chứng                    | Xử lý                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Một màn hình báo lỗi           | Bấm **Thử lại** ngay trên đó. Không có nút thì tải lại trang — trạng thái nằm trên địa chỉ nên vào lại đúng chỗ cũ.                             |
| Bị đăng xuất giữa chừng        | Đăng nhập lại. Nếu **nhiều người cùng bị**, kiểm PostgreSQL trước khi kiểm tài khoản — xem [`van-hanh-ban-demo.md`](van-hanh-ban-demo.md) §5.1. |
| Dữ liệu đã bị thao tác lộn xộn | Chạy lại lệnh làm lại dữ liệu (10 phút). Đừng cố sửa tay giữa buổi.                                                                             |
| Không mở được trang            | Kiểm `/health` **và** `pg_isready` — một mình `/health` chưa đủ để kết luận, xem §5.2.                                                          |

**Đừng demo những thứ này** — chúng chưa có, và nói trước tốt hơn bị hỏi giữa chừng: định vị GPS,
hoá đơn điện tử, sổ sách kế toán theo chuẩn mực, chế độ ngoại tuyến cho lái xe, nhập hàng loạt danh
mục nền, nối ERP.
